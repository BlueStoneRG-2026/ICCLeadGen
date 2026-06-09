import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isReusableEnvelopeStatus } from "../netlify/functions/_shared/docusign";

describe("DocuSign duplicate envelope guard", () => {
  it("reuses only active DocuSign envelope statuses", () => {
    expect(isReusableEnvelopeStatus("created")).toBe(true);
    expect(isReusableEnvelopeStatus("sent")).toBe(true);
    expect(isReusableEnvelopeStatus("delivered")).toBe(true);
    expect(isReusableEnvelopeStatus("completed")).toBe(false);
    expect(isReusableEnvelopeStatus("voided")).toBe(false);
    expect(isReusableEnvelopeStatus("expired")).toBe(false);
  });

  it("checks and reuses an existing envelope before creating a new one", () => {
    const docusignSource = readFileSync("netlify/functions/_shared/docusign.ts", "utf8");

    expect(docusignSource).toContain("existingEnvelopeId?: string | null");
    expect(docusignSource).toContain("/views/recipient");
    expect(docusignSource).toContain("isReusableEnvelopeStatus(status)");
    expect(docusignSource).toContain('status === "completed"');
    expect(docusignSource).toContain("previousEnvelopeStatus");
  });

  it("records in-flight envelopes and skips new envelopes for certified partners", () => {
    const signupSource = readFileSync("netlify/functions/cert-signup.ts", "utf8");

    expect(signupSource).toContain("findReusableEnvelope(userId)");
    expect(signupSource).toContain("existingEnvelopeId: reusableEnvelope?.envelope_id || null");
    expect(signupSource).toContain("partner_esign_envelopes");
    expect(signupSource).toContain('status === "certified"');
    expect(signupSource).toContain("No new DocuSign envelope was created.");
    expect(signupSource).toContain("DOCUSIGN_ENVELOPE_VALID_DAYS");
  });

  it("marks envelope tracking complete from the DocuSign webhook", () => {
    const connectSource = readFileSync("supabase/functions/docusign-connect/index.ts", "utf8");

    expect(connectSource).toContain("markEnvelopeCompleted");
    expect(connectSource).toContain("partner_esign_envelopes");
    expect(connectSource).toContain('status: "completed"');
  });
});
