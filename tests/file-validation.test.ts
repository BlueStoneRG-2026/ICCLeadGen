import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { validateSubmissionFile } from "../netlify/functions/_shared/file-validation";

function pdf(content = "") {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<<>>\nstream\n${content}\nendstream\nendobj\n%%EOF`, "latin1");
}

function xlsx() {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types></Types>"),
      "xl/worksheets/sheet1.xml": strToU8(
        "<worksheet><sheetData><row><c><v>Date</v></c><c><v>Description</v></c><c><v>Amount</v></c><c><v>Deposit</v></c><c><v>Balance</v></c></row></sheetData></worksheet>"
      )
    })
  );
}

describe("submission file validation", () => {
  it("accepts CSV bank-statement-like exports", async () => {
    await expect(
      validateSubmissionFile(Buffer.from("Date,Description,Amount,Balance\n2026-01-01,AMZN MKTP,100,1000"), "text/csv")
    ).resolves.toEqual({ kind: "csv", mime: "text/csv" });
  });

  it("accepts passive PDFs", async () => {
    await expect(validateSubmissionFile(pdf(), "application/pdf")).resolves.toEqual({
      kind: "pdf",
      mime: "application/pdf"
    });
  });

  it("accepts OpenXML XLSX files without using xlsx package parsing", async () => {
    await expect(
      validateSubmissionFile(xlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ).resolves.toEqual({
      kind: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  });

  it("rejects oversized files", async () => {
    await expect(validateSubmissionFile(Buffer.alloc(15 * 1024 * 1024 + 1), "text/csv")).rejects.toMatchObject({
      statusCode: 413
    });
  });

  it("rejects active-content PDFs", async () => {
    await expect(validateSubmissionFile(pdf("/OpenAction /JavaScript"), "application/pdf")).rejects.toMatchObject({
      statusCode: 422
    });
  });

  it("rejects wrong magic bytes for claimed PDFs", async () => {
    await expect(validateSubmissionFile(Buffer.from("not actually a pdf"), "application/pdf")).rejects.toMatchObject({
      statusCode: 422
    });
  });

  it("rejects unsupported file content", async () => {
    await expect(validateSubmissionFile(Buffer.from("MZ fake executable"), "application/octet-stream")).rejects.toMatchObject({
      statusCode: 415
    });
  });
});

