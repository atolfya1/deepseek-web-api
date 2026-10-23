/** Verifies buffered Chat Completions mapping for tool-compatible turns. */
import { describe, expect, it } from "vitest";

import {
  consumeToolChat,
  emitToolChat,
  streamPlainChat,
  type ChatRun,
  type ChatStreamChunk,
} from "../../src/deepseek/chatStream.js";
import { EMPTY_TOOL_RESPONSE_TEXT } from "../../src/deepseek/toolOutcome.js";

function upstream(parts: { reasoning?: string; output?: string }): Response {
  const fragments = [
    ...(parts.reasoning ? [{ type: "THINK", content: parts.reasoning }] : []),
    ...(parts.output ? [{ type: "RESPONSE", content: parts.output }] : []),
  ];
  return new Response(
    'event: ready\ndata: {"response_message_id":7}\n\n' +
      `data: {"p":"response/fragments","o":"APPEND","v":${JSON.stringify(fragments)}}\n\n`,
  );
}

function run(stream: Response): ChatRun {
  return { upstream: stream, publicModel: "deepseek-v4-pro", sessionId: "session-1" };
}

function content(chunks: ChatStreamChunk[]): string {
  return chunks.flatMap((chunk) =>
    chunk.choices.flatMap((choice) =>
      typeof choice.delta.content === "string" ? [choice.delta.content] : [],
    ),
  ).join("");
}

function reasoning(chunks: ChatStreamChunk[]): string {
  return chunks.flatMap((chunk) =>
    chunk.choices.flatMap((choice) =>
      typeof choice.delta.reasoning_content === "string" ? [choice.delta.reasoning_content] : [],
    ),
  ).join("");
}

function liveUpstream(pieces: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece));
      controller.close();
    },
  });
  return new Response(body);
}

describe("plain Chat stream mapping", () => {
  it("streams thinking and answer deltas live instead of buffering the full answer", async () => {
    const think = (delta: string): string =>
      `data: ${JSON.stringify({ p: "response/fragments", o: "APPEND", v: [{ type: "THINK", content: delta }] })}\n\n`;
    const respond = (delta: string): string =>
      `data: ${JSON.stringify({ p: "response/fragments", o: "APPEND", v: [{ type: "RESPONSE", content: delta }] })}\n\n`;
    const stream = liveUpstream([
      'event: ready\ndata: {"response_message_id":7}\n\n',
      think("t1"),
      think("t2"),
      respond("a1"),
      respond("a2"),
    ]);
    const seen: Array<{ channel: string; length: number }> = [];
    let emittedMidStream = false;
    const chunks: ChatStreamChunk[] = [];
    const result = await streamPlainChat(run(stream), (chunk) => {
      chunks.push(chunk);
      const delta = chunk.choices[0]?.delta ?? {};
      if (typeof delta.reasoning_content === "string") seen.push({ channel: "reasoning", length: delta.reasoning_content.length });
      if (typeof delta.content === "string") seen.push({ channel: "content", length: delta.content.length });
      if (chunks.length >= 3 && chunks.length < 6) emittedMidStream = true;
    });

    expect(reasoning(chunks)).toBe("t1t2");
    expect(content(chunks)).toBe("a1a2");
    expect(emittedMidStream).toBe(true);
    expect(seen).toEqual([
      { channel: "reasoning", length: 2 },
      { channel: "reasoning", length: 2 },
      { channel: "content", length: 2 },
      { channel: "content", length: 2 },
    ]);
    expect(result.finalText).toBe("a1a2");
    expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe("stop");
  });

  it("promotes reasoning-only text into content without duplication", async () => {
    const chunks: ChatStreamChunk[] = [];
    const result = await streamPlainChat(run(upstream({ reasoning: "thinking only" })), (chunk) => chunks.push(chunk));

    expect(content(chunks)).toBe("thinking only");
    expect(reasoning(chunks)).toBe("thinking only");
    expect(result.diagnostics.promotedReasoning).toBe(true);
  });
});

describe("tool Chat stream mapping", () => {
  it("promotes reasoning-only prose into visible content without duplication", async () => {
    const result = await consumeToolChat(run(upstream({ reasoning: "继续读取 src 目录。" })), "");
    const chunks: ChatStreamChunk[] = [];
    emitToolChat(run(new Response()), result, "hidden", (chunk) => chunks.push(chunk));

    expect(content(chunks)).toBe("继续读取 src 目录。");
    expect(JSON.stringify(chunks)).not.toContain("reasoning_content");
    expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe("stop");
  });

  it("emits a visible fallback instead of an empty stop", async () => {
    const result = await consumeToolChat(run(upstream({})), EMPTY_TOOL_RESPONSE_TEXT);
    const chunks: ChatStreamChunk[] = [];
    emitToolChat(run(new Response()), result, "hidden", (chunk) => chunks.push(chunk));

    expect(content(chunks)).toBe(EMPTY_TOOL_RESPONSE_TEXT);
    expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe("stop");
  });

  it("keeps repaired tool calls as tool_calls", async () => {
    const output = '<_call>\n{"name":"read","arguments":{"path":"src/index.ts"}\n</tool_call>';
    const result = await consumeToolChat(run(upstream({ output })), "");
    const chunks: ChatStreamChunk[] = [];
    emitToolChat(run(new Response()), result, "hidden", (chunk) => chunks.push(chunk));

    expect(JSON.stringify(chunks)).toContain('"name":"read"');
    expect(content(chunks)).toBe("");
    expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe("tool_calls");
  });
});
