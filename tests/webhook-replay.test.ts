import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("webhook replay and out-of-order hardening", () => {
  it("handles replayed completed DocuSign events without re-certifying or re-sending email", () => {
    const source = readFileSync("supabase/functions/docusign-connect/index.ts", "utf8");
    const idempotentBranch = source.indexOf('partner.status === "certified" && partner.esign_envelope_id === envelopeId');
    const idempotentReturn = source.indexOf("idempotent: true");
    const statusUpdate = source.indexOf(".update({\n      esign_envelope_id: envelopeId");
    const emailSend = source.indexOf("await sendCertifiedEmail");

    expect(idempotentBranch).toBeGreaterThan(-1);
    expect(idempotentReturn).toBeGreaterThan(idempotentBranch);
    expect(idempotentReturn).toBeLessThan(statusUpdate);
    expect(idempotentReturn).toBeLessThan(emailSend);
  });

  it("ignores out-of-order DocuSign statuses without mutating partner state", () => {
    const source = readFileSync("supabase/functions/docusign-connect/index.ts", "utf8");
    const nonCompletedBranch = source.indexOf('if (status !== "completed")');
    const partnerUpdate = source.indexOf("esign_envelope_id: envelopeId");

    expect(nonCompletedBranch).toBeGreaterThan(-1);
    expect(source).toContain("ignored: true, status");
    expect(nonCompletedBranch).toBeLessThan(partnerUpdate);
  });

  it("keeps SendGrid suppression replay idempotent and non-suppression events no-op", () => {
    const source = readFileSync("supabase/functions/sendgrid-events/index.ts", "utf8");
    const noSuppressionBranch = source.indexOf("if (!suppressions.length)");
    const upsert = source.indexOf('.from("suppression").upsert(suppressions, { onConflict: "email" })');

    expect(source).toContain('new Set(["bounce", "dropped", "spamreport"])');
    expect(source).toContain("return jsonResponse(200, { ok: true, inserted: 0 })");
    expect(noSuppressionBranch).toBeGreaterThan(-1);
    expect(noSuppressionBranch).toBeLessThan(upsert);
    expect(upsert).toBeGreaterThan(-1);
  });
});
