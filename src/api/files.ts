/** Handles OpenAI-compatible file upload endpoint mapped to DeepSeek Web. */
import type { IncomingMessage, ServerResponse } from "node:http";

import type { DeepSeekClient } from "../deepseek/client.js";
import { HttpError } from "../utils/errors.js";
import { writeJson } from "../utils/http.js";
import { isRecord } from "../utils/json.js";

interface ParsedFilePart {
  data: Buffer;
  filename: string;
  contentType: string;
}

function parseMultipartBody(body: Buffer, boundary: string): ParsedFilePart | null {
  const boundarySeparator = `--${boundary}`;
  const rawParts = body.toString("binary").split(boundarySeparator);

  for (const part of rawParts) {
    if (!part.includes("filename=")) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headersText = part.slice(0, headerEnd);
    const contentBinary = part.slice(headerEnd + 4, part.lastIndexOf("\r\n"));

    const filenameMatch = /filename="?([^";\r\n]+)"?/i.exec(headersText);
    const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headersText);

    const filename = filenameMatch ? filenameMatch[1] ?? "uploaded_file" : "uploaded_file";
    const contentType = contentTypeMatch ? contentTypeMatch[1]?.trim() ?? "application/octet-stream" : "application/octet-stream";

    return {
      data: Buffer.from(contentBinary, "binary"),
      filename,
      contentType,
    };
  }
  return null;
}

export async function handleFiles(
  request: IncomingMessage,
  response: ServerResponse,
  client: DeepSeekClient,
): Promise<void> {
  const contentType = request.headers["content-type"] || "";
  const chunks: Buffer[] = [];
  let totalLength = 0;
  const maxBytes = 50 * 1024 * 1024; // 50MB max file size

  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buf.length;
    if (totalLength > maxBytes) throw new HttpError(413, "Uploaded file too large");
    chunks.push(buf);
  }
  const bodyBuffer = Buffer.concat(chunks);

  let filePart: ParsedFilePart | null = null;

  if (contentType.includes("multipart/form-data")) {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    const boundary = match ? match[1] || match[2] : null;
    if (!boundary) throw new HttpError(400, "Missing multipart boundary");
    filePart = parseMultipartBody(bodyBuffer, boundary);
  } else {
    // Attempt JSON parse
    const raw = bodyBuffer.toString("utf8");
    try {
      const json = JSON.parse(raw);
      if (isRecord(json)) {
        const filename = typeof json.filename === "string" ? json.filename : "document.txt";
        let data: Buffer | null = null;
        if (typeof json.file === "string") {
          data = json.file.startsWith("data:")
            ? Buffer.from(json.file.slice(json.file.indexOf(",") + 1), "base64")
            : Buffer.from(json.file, "utf8");
        } else if (typeof json.content === "string") {
          data = Buffer.from(json.content, "utf8");
        } else if (typeof json.base64 === "string") {
          data = Buffer.from(json.base64, "base64");
        }
        if (data) {
          filePart = {
            data,
            filename,
            contentType: typeof json.content_type === "string" ? json.content_type : "application/octet-stream",
          };
        }
      }
    } catch {
      // not JSON
    }
  }

  if (!filePart) {
    throw new HttpError(400, "No file provided; send multipart/form-data or JSON with file/content");
  }

  const result = await client.uploadFile({
    data: filePart.data,
    filename: filePart.filename,
    contentType: filePart.contentType,
  });

  writeJson(response, 200, {
    id: result.fileId,
    object: "file",
    bytes: result.fileSize,
    created_at: Math.floor(Date.now() / 1000),
    filename: result.fileName,
    purpose: "assistants",
    status: result.status === "SUCCESS" ? "processed" : "uploaded",
  });
}
