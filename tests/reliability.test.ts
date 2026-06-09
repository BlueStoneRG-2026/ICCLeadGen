import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ExternalTimeoutError, withExternalTimeout } from "../netlify/functions/_shared/timeout";

describe("external call reliability", () => {
  it("fails external calls with a sanitized timeout error", async () => {
    await expect(withExternalTimeout("Example provider", new Promise(() => undefined), 1)).rejects.toMatchObject({
      name: "ExternalTimeoutError",
      statusCode: 504
    });
  });

  it("wraps SendGrid, DocuSign, and Supabase calls with timeouts", () => {
    const emailSource = readFileSync("netlify/functions/_shared/email.ts", "utf8");
    const docusignSource = readFileSync("netlify/functions/_shared/docusign.ts", "utf8");
    const envSource = readFileSync("netlify/functions/_shared/env.ts", "utf8");
    const docusignEdge = readFileSync("supabase/functions/docusign-connect/index.ts", "utf8");
    const sendgridEdge = readFileSync("supabase/functions/sendgrid-events/index.ts", "utf8");

    expect(emailSource).toContain('withExternalTimeout(\n      "SendGrid send"');
    expect(emailSource).toContain('externalTimeoutMs("SENDGRID_CALL_TIMEOUT_MS")');
    expect(docusignSource).toContain('externalTimeoutMs("DOCUSIGN_CALL_TIMEOUT_MS")');
    expect(docusignSource).toContain("DocuSign API request failed.");
    expect(docusignSource).not.toContain("DocuSign API request failed: ${text}");
    expect(envSource).toContain("global: { fetch: fetchWithTimeout }");
    expect(docusignEdge).toContain("global: { fetch: fetchWithTimeout }");
    expect(sendgridEdge).toContain("global: { fetch: fetchWithTimeout }");
  });

  it("keeps transactional email retries durable, bounded, and admin-visible", () => {
    const emailSource = readFileSync("netlify/functions/_shared/email.ts", "utf8");
    const actionSource = readFileSync("netlify/functions/admin-action.ts", "utf8");
    const dataSource = readFileSync("netlify/functions/admin-data.ts", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const schema = readFileSync("supabase/migrations/0004_outbox_events.sql", "utf8");

    expect(emailSource).toContain("enqueueTransactionalEmail");
    expect(emailSource).toContain("processOutboxEvent");
    expect(emailSource).toContain("event_key");
    expect(schema).toContain("attempts < max_attempts");
    expect(schema).toContain("status IN ('queued','processing','sent','failed','dead')");
    expect(actionSource).toContain('z.literal("retry_outbox_event")');
    expect(actionSource).toContain("certifiedEmailEventKey");
    expect(actionSource).toContain("processOutboxEvent(outboxEvent.id");
    expect(dataSource).toContain("outbox_events");
    expect(appSource).toContain("Email outbox");
    expect(appSource).toContain("retry_outbox_event");
  });

  it("uses stable idempotency keys for retryable partner and submission emails", () => {
    const signupSource = readFileSync("netlify/functions/cert-signup.ts", "utf8");
    const intakeSource = readFileSync("netlify/functions/intake.ts", "utf8");
    const certifiedSource = readFileSync("netlify/functions/certified-email.ts", "utf8");

    expect(signupSource).toContain("isoReadyEmailEventKey(userId, envelope.envelopeId)");
    expect(intakeSource).toContain("submissionStatusEmailEventKey(submissionId, routingState)");
    expect(certifiedSource).toContain("eventKey: `certified:${payload.referralToken}`");
  });

  it("exports the timeout error type for sanitized function responses", () => {
    expect(new ExternalTimeoutError("Provider", 10)).toMatchObject({
      name: "ExternalTimeoutError",
      statusCode: 504
    });
  });
});
