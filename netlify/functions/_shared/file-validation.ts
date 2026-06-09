import { fileTypeFromBuffer } from "file-type";
import { unzipSync } from "fflate";
import Papa from "papaparse";

export type AllowedFileKind = "csv" | "pdf" | "xlsx";

const maxFileBytes = 15 * 1024 * 1024;
const maxXlsxEntries = 200;
const maxXlsxExtractedBytes = 4 * 1024 * 1024;
const maxSingleXlsxXmlBytes = 2 * 1024 * 1024;
const headerHints = ["date", "description", "amount", "credit", "debit", "deposit", "balance"];
const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function validateSubmissionFile(buffer: Buffer, originalMime = "") {
  if (buffer.byteLength > maxFileBytes) {
    throw Object.assign(new Error("Files must be 15 MB or smaller."), { statusCode: 413 });
  }

  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime || originalMime;

  if (mime === "application/pdf") {
    validatePdf(buffer);
    return { kind: "pdf" as AllowedFileKind, mime };
  }

  if (mime === xlsxMime || (originalMime === xlsxMime && mime === "application/zip")) {
    validateXlsx(buffer);
    return { kind: "xlsx" as AllowedFileKind, mime: xlsxMime };
  }

  if (mime.includes("csv") || looksLikeCsv(buffer)) {
    validateCsv(buffer);
    return { kind: "csv" as AllowedFileKind, mime: "text/csv" };
  }

  throw Object.assign(new Error("Only CSV, PDF, or XLSX statements are accepted."), { statusCode: 415 });
}

export function extractCheckerText(buffer: Buffer, kind: AllowedFileKind, fallback = "") {
  if (kind === "csv") {
    return buffer.toString("utf8", 0, Math.min(buffer.byteLength, 96_000));
  }

  if (kind === "xlsx") {
    return extractXlsxText(buffer);
  }

  return fallback;
}

function validatePdf(buffer: Buffer) {
  const head = buffer.toString("latin1", 0, Math.min(buffer.byteLength, 20));
  if (!head.includes("%PDF")) {
    throw Object.assign(new Error("PDF parse failed."), { statusCode: 422 });
  }

  const scan = buffer.toString("latin1", 0, Math.min(buffer.byteLength, 1_000_000));
  if (scan.includes("PK\u0003\u0004")) {
    throw Object.assign(new Error("PDF polyglot content was rejected."), { statusCode: 422 });
  }

  if (/\/JavaScript|\/JS|\/AA|\/OpenAction/i.test(scan)) {
    throw Object.assign(new Error("PDF includes active script content and was rejected."), { statusCode: 422 });
  }
}

function validateCsv(buffer: Buffer) {
  const sample = buffer.toString("utf8", 0, Math.min(buffer.byteLength, 48_000));
  const parsed = Papa.parse<string[]>(sample, { preview: 12, skipEmptyLines: true });
  if (parsed.errors.length || !parsed.data.length) {
    throw Object.assign(new Error("CSV parse failed."), { statusCode: 422 });
  }

  const headerText = parsed.data
    .slice(0, 4)
    .flat()
    .join(" ")
    .toLowerCase();
  const hintCount = headerHints.filter((hint) => headerText.includes(hint)).length;
  if (hintCount < 2) {
    throw Object.assign(new Error("CSV does not look like a bank-statement export."), { statusCode: 422 });
  }
}

function validateXlsx(buffer: Buffer) {
  const text = extractXlsxText(buffer);
  if (!text) {
    throw Object.assign(new Error("XLSX parse failed."), { statusCode: 422 });
  }

  const hintCount = headerHints.filter((hint) => text.toLowerCase().includes(hint)).length;
  if (hintCount < 2) {
    throw Object.assign(new Error("XLSX does not look like a bank-statement export."), { statusCode: 422 });
  }
}

function looksLikeCsv(buffer: Buffer) {
  const sample = buffer.toString("utf8", 0, Math.min(buffer.byteLength, 1024));
  return !sample.includes("\u0000") && sample.includes(",") && /date|amount|description|balance/i.test(sample);
}

function extractXlsxText(buffer: Buffer) {
  let files: Record<string, Uint8Array>;
  let entryCount = 0;
  let extractedBytes = 0;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter(file) {
        entryCount += 1;
        if (entryCount > maxXlsxEntries) {
          throw Object.assign(new Error("XLSX has too many ZIP entries."), { statusCode: 413 });
        }

        if (hasUnsafeZipPath(file.name)) {
          throw Object.assign(new Error("XLSX ZIP path is unsafe."), { statusCode: 422 });
        }

        const wanted =
          file.name === "[Content_Types].xml" ||
          file.name === "xl/sharedStrings.xml" ||
          file.name.startsWith("xl/worksheets/");
        if (!wanted) {
          return false;
        }

        if (file.originalSize > maxSingleXlsxXmlBytes) {
          throw Object.assign(new Error("XLSX XML part is too large."), { statusCode: 413 });
        }

        extractedBytes += file.originalSize;
        if (extractedBytes > maxXlsxExtractedBytes) {
          throw Object.assign(new Error("XLSX expanded content is too large."), { statusCode: 413 });
        }

        return true;
      }
    });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) {
      throw error;
    }
    throw Object.assign(new Error("XLSX zip parse failed."), { statusCode: 422 });
  }

  const names = Object.keys(files);
  if (!names.includes("[Content_Types].xml") || !names.some((name) => name.startsWith("xl/worksheets/"))) {
    throw Object.assign(new Error("XLSX workbook structure is invalid."), { statusCode: 422 });
  }

  const decoder = new TextDecoder();
  return names
    .filter((name) => name === "xl/sharedStrings.xml" || name.startsWith("xl/worksheets/"))
    .map((name) => decoder.decode(files[name]).replace(/<[^>]+>/g, " "))
    .join("\n")
    .slice(0, 120_000);
}

function hasUnsafeZipPath(name: string) {
  return name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => part === "..");
}
