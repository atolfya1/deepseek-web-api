/** Handles file uploads and status polling directly against chat.deepseek.com. */
import { CLIENT_HEADERS } from "../config/constants.js";
import type { AppConfig } from "../config/env.js";
import { solvePowInNode, type ChallengeData } from "./nodePow.js";
import type { DeepSeekAuth, RequestBody } from "./types.js";

export interface UploadedFileResult {
  fileId: string;
  fileName: string;
  fileSize: number;
  status: string;
}

const UPLOAD_PATH = "/api/v0/file/upload_file";
const FETCH_FILES_PATH = "/api/v0/file/fetch_files";

/** Upload a file directly to DeepSeek Web using PoW challenge and session auth. */
export async function uploadFileToDeepSeek(
  config: AppConfig,
  auth: DeepSeekAuth,
  input: {
    data: Buffer | Uint8Array | string;
    filename: string;
    contentType?: string | undefined;
  },
): Promise<UploadedFileResult> {
  const authHeaders = {
    authorization: `Bearer ${auth.token}`,
    cookie: auth.cookie,
    origin: config.baseUrl,
    referer: `${config.baseUrl}/`,
    ...CLIENT_HEADERS,
  };

  const challengeRes = await fetch(`${config.baseUrl}/api/v0/chat/create_pow_challenge`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ target_path: UPLOAD_PATH }),
  });
  if (!challengeRes.ok) {
    throw new Error(`PoW challenge for file upload failed: HTTP ${challengeRes.status}`);
  }

  const challengeJson = (await challengeRes.json()) as {
    code?: number;
    data?: { biz_code?: number; biz_data?: { challenge?: ChallengeData } };
  };
  const challenge = challengeJson?.data?.biz_data?.challenge;
  if (!challenge || challengeJson.code !== 0 || challengeJson?.data?.biz_code !== 0) {
    throw new Error(`Invalid challenge for file upload: ${JSON.stringify(challengeJson)}`);
  }

  const ans = await solvePowInNode(challenge, config.powWorkerUrl);
  const powHeader = Buffer.from(
    JSON.stringify({
      algorithm: ans.algorithm,
      challenge: ans.challenge,
      salt: ans.salt,
      answer: ans.answer,
      signature: ans.signature,
      target_path: UPLOAD_PATH,
    }),
  ).toString("base64");

  const formData = new FormData();
  const fileBytes = typeof input.data === "string" ? Buffer.from(input.data, "utf8") : input.data;
  const blob = new Blob([fileBytes as unknown as BlobPart], { type: input.contentType || "application/octet-stream" });
  formData.append("file", blob, input.filename);

  const uploadRes = await fetch(`${config.baseUrl}${UPLOAD_PATH}`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "x-ds-pow-response": powHeader,
    },
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error(`File upload request failed: HTTP ${uploadRes.status}`);
  }

  const uploadJson = (await uploadRes.json()) as {
    code?: number;
    data?: {
      biz_code?: number;
      biz_data?: {
        id?: string;
        file_name?: string;
        file_size?: number;
        status?: string;
      };
    };
  };

  const bizData = uploadJson?.data?.biz_data;
  const fileId = bizData?.id;
  if (!fileId || uploadJson.code !== 0) {
    throw new Error(`File upload rejected: ${JSON.stringify(uploadJson)}`);
  }

  const initialStatus = bizData.status || "PENDING";
  if (initialStatus === "SUCCESS") {
    return {
      fileId,
      fileName: bizData.file_name || input.filename,
      fileSize: bizData.file_size || fileBytes.length,
      status: "SUCCESS",
    };
  }

  // Poll for parsing completion (up to 15 seconds)
  const maxWait = 15_000;
  const start = Date.now();
  let currentStatus = initialStatus;

  while (Date.now() - start < maxWait && currentStatus !== "SUCCESS" && currentStatus !== "FAILED") {
    await new Promise((r) => setTimeout(r, 1_000));
    try {
      const fetchRes = await fetch(`${config.baseUrl}${FETCH_FILES_PATH}?file_ids=${encodeURIComponent(fileId)}`, {
        headers: authHeaders,
      });
      if (fetchRes.ok) {
        const fetchJson = (await fetchRes.json()) as {
          data?: { biz_data?: { files?: Array<{ id: string; status: string }> } };
        };
        const fileObj = fetchJson?.data?.biz_data?.files?.find((f) => f.id === fileId);
        if (fileObj) {
          currentStatus = fileObj.status;
          if (currentStatus === "SUCCESS") break;
        }
      }
    } catch {
      // Ignore polling errors and continue
    }
  }

  return {
    fileId,
    fileName: bizData.file_name || input.filename,
    fileSize: bizData.file_size || fileBytes.length,
    status: currentStatus,
  };
}

/** Extract existing or uploaded file IDs from an incoming request body. */
export async function resolveRefFileIds(
  config: AppConfig,
  auth: DeepSeekAuth,
  body: RequestBody,
): Promise<string[]> {
  const fileIds: string[] = [];

  // 1. Direct file ID arrays
  const direct = Array.isArray(body.ref_file_ids)
    ? body.ref_file_ids
    : Array.isArray(body.file_ids)
      ? body.file_ids
      : [];
  for (const item of direct) {
    if (typeof item === "string" && item.trim()) fileIds.push(item.trim());
  }

  // 2. Inline attachments or files array with raw content or base64
  const inlineFiles: unknown[] = [];
  if (Array.isArray(body.files)) inlineFiles.push(...body.files);
  if (Array.isArray(body.attachments)) inlineFiles.push(...body.attachments);

  // 3. Scan messages for attachment objects
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (typeof msg === "object" && msg !== null && "content" in msg) {
        const content = (msg as { content: unknown }).content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (typeof part === "object" && part !== null) {
              const p = part as Record<string, unknown>;
              if (typeof p.file_id === "string") fileIds.push(p.file_id);
              else if (p.type === "file" || p.type === "image_url") inlineFiles.push(p);
            }
          }
        }
      }
    }
  }

  for (const item of inlineFiles) {
    if (typeof item === "object" && item !== null) {
      const rec = item as Record<string, unknown>;
      if (typeof rec.file_id === "string") {
        fileIds.push(rec.file_id);
        continue;
      }
      const filename = String(rec.filename || rec.name || "attachment.txt");
      let buffer: Buffer | null = null;
      if (typeof rec.base64 === "string") {
        buffer = Buffer.from(rec.base64, "base64");
      } else if (typeof rec.data === "string") {
        const dataStr = rec.data;
        const comma = dataStr.indexOf(",");
        if (dataStr.startsWith("data:") && comma > 0) {
          buffer = Buffer.from(dataStr.slice(comma + 1), "base64");
        } else {
          buffer = Buffer.from(dataStr, "utf8");
        }
      } else if (typeof rec.content === "string") {
        buffer = Buffer.from(rec.content, "utf8");
      }
      if (buffer) {
        const uploaded = await uploadFileToDeepSeek(config, auth, {
          data: buffer,
          filename,
          ...(typeof rec.content_type === "string" ? { contentType: rec.content_type } : {}),
        });
        fileIds.push(uploaded.fileId);
      }
    }
  }

  return [...new Set(fileIds)];
}
