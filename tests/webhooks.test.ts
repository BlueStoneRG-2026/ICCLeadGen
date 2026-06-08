import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  unsignedWebhookAllowed,
  verifierRequired,
  verifyDocusignHmac,
  verifySendGridSignature
} from "../supabase/functions/_shared/webhook-verification";

describe("DocuSign Connect HMAC verifier", () => {
  it("accepts valid signatures and rejects tampered payloads", async () => {
    const body = JSON.stringify({ event: "envelope-completed", envelopeId: "env-1" });
    const secret = "connect-secret";
    const signatureHeader = createHmac("sha256", secret).update(body).digest("base64");

    await expect(verifyDocusignHmac(body, secret, signatureHeader)).resolves.toBe(true);
    await expect(verifyDocusignHmac(`${body}x`, secret, signatureHeader)).resolves.toBe(false);
    await expect(verifyDocusignHmac(body, secret, "")).resolves.toBe(false);
  });

  it("fails closed when the HMAC secret is missing unless explicitly local unsigned", () => {
    expect(verifierRequired("", { allowUnsigned: "false", supabaseUrl: "https://prod.supabase.co" })).toBe(false);
    expect(unsignedWebhookAllowed({ allowUnsigned: "true", supabaseUrl: "https://prod.supabase.co" })).toBe(false);
    expect(unsignedWebhookAllowed({ allowUnsigned: "true", supabaseUrl: "http://127.0.0.1:54321" })).toBe(true);
  });
});

describe("SendGrid Event Webhook verifier", () => {
  it("accepts valid signatures and rejects tampered payloads", async () => {
    const body = JSON.stringify([{ event: "bounce", email: "broker@example.com" }]);
    const timestamp = "1760000000";
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const signatureHeader = sign("sha256", Buffer.from(`${timestamp}${body}`), privateKey).toString("base64");
    const req = new Request("http://localhost/sendgrid-events", {
      method: "POST",
      headers: {
        "X-Twilio-Email-Event-Webhook-Signature": signatureHeader,
        "X-Twilio-Email-Event-Webhook-Timestamp": timestamp
      },
      body
    });

    await expect(verifySendGridSignature(req, body, publicKeyPem)).resolves.toBe(true);
    await expect(verifySendGridSignature(req, `${body}x`, publicKeyPem)).resolves.toBe(false);
    await expect(verifySendGridSignature(new Request("http://localhost"), body, publicKeyPem)).resolves.toBe(false);
  });

  it("fails closed when the public key is missing unless explicitly local unsigned", () => {
    expect(verifierRequired("", { allowUnsigned: "false", supabaseUrl: "https://prod.supabase.co" })).toBe(false);
    expect(verifierRequired("", { allowUnsigned: "true", functionsLocal: "true" })).toBe(true);
  });
});

