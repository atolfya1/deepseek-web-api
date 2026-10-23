/** Node.js in-process DeepSeek PoW solver and session initializer. */
import vm from "node:vm";

import { CLIENT_HEADERS, COMPLETION_PATH } from "../config/constants.js";
import type { DeepSeekAuth, ModelType } from "./types.js";
import type { PreparedCompletion } from "./pow.js";

interface ChallengeData {
  algorithm: string;
  challenge: string;
  salt: string;
  difficulty: number;
  signature: string;
  expire_at?: number;
  expireAt?: number;
}

interface PowAnswer {
  algorithm: string;
  challenge: string;
  salt: string;
  answer: number;
  signature: string;
}

let cachedWorker: { code: string; chunk: string } | null = null;

async function loadWorkerBundle(powWorkerUrl: string): Promise<{ code: string; chunk: string }> {
  if (cachedWorker) return cachedWorker;
  const code = await fetch(powWorkerUrl).then((r) => r.text());
  const chunkUrl = powWorkerUrl.replace(/static\/[^/]+\.js$/, "static/8138.63461459c3.js");
  const chunk = await fetch(chunkUrl).then((r) => r.text());
  cachedWorker = { code, chunk };
  return cachedWorker;
}

/** Solve DeepSeekHashV1 challenge using the official worker script in Node VM. */
export async function solvePowInNode(challenge: ChallengeData, powWorkerUrl: string): Promise<PowAnswer> {
  const workerBundle = await loadWorkerBundle(powWorkerUrl);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("PoW solve timeout in Node")), 60_000);
    const sandbox: Record<string, unknown> = {
      postMessage: (msg: unknown) => {
        if (
          typeof msg === "object" &&
          msg !== null &&
          "type" in msg &&
          msg.type === "pow-answer" &&
          "answer" in msg
        ) {
          clearTimeout(timeout);
          resolve(msg.answer as PowAnswer);
        } else if (
          typeof msg === "object" &&
          msg !== null &&
          "type" in msg &&
          msg.type === "pow-error"
        ) {
          clearTimeout(timeout);
          reject(new Error("PoW calculation failed in worker"));
        }
      },
      importScripts: () => {
        vm.runInContext(workerBundle.chunk, sandbox);
      },
      console,
      setTimeout,
      clearTimeout,
    };
    sandbox["self"] = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(workerBundle.code, sandbox);

    setTimeout(() => {
      const onmessage = sandbox["onmessage"] as ((event: { data: unknown }) => void) | undefined;
      if (typeof onmessage === "function") {
        onmessage({
          data: {
            type: "pow-challenge",
            challenge: {
              algorithm: challenge.algorithm,
              challenge: challenge.challenge,
              salt: challenge.salt,
              difficulty: challenge.difficulty,
              signature: challenge.signature,
              expireAt: challenge.expire_at ?? challenge.expireAt,
            },
          },
        });
      } else {
        clearTimeout(timeout);
        reject(new Error("PoW worker onmessage handler not registered"));
      }
    }, 50);
  });
}

/** Prepare completion without browser dependency when token and cookies are available. */
export async function prepareCompletionNode(input: {
  baseUrl: string;
  powWorkerUrl: string;
  auth: DeepSeekAuth;
  modelType: ModelType;
  sessionId: string | null;
  reuseSession: boolean;
}): Promise<PreparedCompletion> {
  const authHeaders = {
    authorization: `Bearer ${input.auth.token}`,
    "content-type": "application/json",
    cookie: input.auth.cookie,
    origin: input.baseUrl,
    referer: `${input.baseUrl}/`,
    ...CLIENT_HEADERS,
  };

  const challengeRes = await fetch(`${input.baseUrl}/api/v0/chat/create_pow_challenge`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ target_path: COMPLETION_PATH }),
  });
  if (!challengeRes.ok) {
    throw new Error(`PoW challenge HTTP failed: ${challengeRes.status}`);
  }
  const challengeBody = (await challengeRes.json()) as {
    code?: number;
    data?: { biz_code?: number; biz_data?: { challenge?: ChallengeData } };
  };
  const challenge = challengeBody?.data?.biz_data?.challenge;
  if (!challenge || challengeBody.code !== 0 || challengeBody?.data?.biz_code !== 0) {
    throw new Error(`PoW challenge returned error: ${JSON.stringify(challengeBody)}`);
  }

  const answer = await solvePowInNode(challenge, input.powWorkerUrl);
  const powHeader = Buffer.from(
    JSON.stringify({
      algorithm: answer.algorithm,
      challenge: answer.challenge,
      salt: answer.salt,
      answer: answer.answer,
      signature: answer.signature,
      target_path: COMPLETION_PATH,
    }),
  ).toString("base64");

  let resolvedSessionId = input.sessionId;
  if (!input.reuseSession || !resolvedSessionId) {
    const sessionRes = await fetch(`${input.baseUrl}/api/v0/chat_session/create`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    if (!sessionRes.ok) {
      throw new Error(`Session create HTTP failed: ${sessionRes.status}`);
    }
    const sessionBody = (await sessionRes.json()) as {
      data?: { biz_data?: { chat_session?: { id?: string } } };
    };
    resolvedSessionId = sessionBody?.data?.biz_data?.chat_session?.id ?? null;
    if (!resolvedSessionId) {
      throw new Error(`Session create failed: ${JSON.stringify(sessionBody)}`);
    }
  }

  return {
    token: input.auth.token,
    powHeader,
    sessionId: resolvedSessionId,
    modelType: input.modelType,
    reused: Boolean(input.reuseSession && input.sessionId),
  };
}
