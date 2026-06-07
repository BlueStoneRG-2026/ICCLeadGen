import Busboy from "busboy";
import type { HandlerEvent } from "@netlify/functions";

export interface ParsedFile {
  fieldName: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export async function parseMultipart(event: HandlerEvent) {
  const contentType = event.headers["content-type"] || event.headers["Content-Type"];
  if (!contentType?.includes("multipart/form-data")) {
    throw Object.assign(new Error("Expected multipart form data."), { statusCode: 400 });
  }

  return new Promise<{ fields: Record<string, string>; files: ParsedFile[] }>((resolve, reject) => {
    const fields: Record<string, string> = {};
    const files: ParsedFile[] = [];
    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: 15 * 1024 * 1024, files: 1 }
    });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (fieldName, file, info) => {
      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("limit", () => {
        reject(Object.assign(new Error("Files must be 15 MB or smaller."), { statusCode: 413 }));
      });
      file.on("end", () => {
        files.push({
          fieldName,
          fileName: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, files }));
    busboy.end(Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8"));
  });
}
