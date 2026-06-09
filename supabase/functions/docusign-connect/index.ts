import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifierRequired,
  verifyDocusignHmac
} from "../_shared/webhook-verification.ts";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("DocuSign webhook unexpected error.", safeLogError(error));
    return jsonResponse((error as { statusCode?: number })?.statusCode || 500, {
      error: (error as { statusCode?: number })?.statusCode === 400 ? "Invalid JSON payload." : "Unexpected webhook error."
    });
  }
});

async function handleRequest(req: Request) {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const bodyText = await req.text();
  const secret = Deno.env.get("DOCUSIGN_CONNECT_HMAC_SECRET") || "";
  const signature = req.headers.get("X-DocuSign-Signature-1") || "";

  if (
    !verifierRequired(secret, {
      allowUnsigned: Deno.env.get("ALLOW_UNSIGNED_WEBHOOKS") || "",
      functionsLocal: Deno.env.get("SUPABASE_FUNCTIONS_LOCAL") || "",
      supabaseUrl: Deno.env.get("SUPABASE_URL") || ""
    })
  ) {
    return jsonResponse(401, { error: "Missing DocuSign Connect HMAC secret." });
  }

  if (secret && (!signature || !(await safelyVerifyDocusignHmac(bodyText, secret, signature)))) {
    return jsonResponse(401, { error: "Invalid DocuSign signature." });
  }

  const payload = parseJson(bodyText);
  const status = extractEnvelopeStatus(payload);
  if (status !== "completed") {
    return jsonResponse(200, { ok: true, ignored: true, status });
  }

  const envelopeId = extractEnvelopeId(payload);
  const partnerId = extractCustomField(payload, "partner_id");

  if (!envelopeId || !partnerId) {
    return jsonResponse(422, { error: "Missing envelope ID or partner custom field." });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
      global: { fetch: fetchWithTimeout }
    }
  );

  const partnerResult = await supabase
    .from("partners")
    .select("id,email,full_name,status,referral_token,esign_envelope_id")
    .eq("id", partnerId)
    .single();

  if (partnerResult.error) {
    console.error("DocuSign partner lookup failed.", safeLogError(partnerResult.error));
    return jsonResponse(500, { error: "Partner lookup failed." });
  }

  const partner = partnerResult.data;
  if (partner.status === "certified" && partner.esign_envelope_id === envelopeId) {
    await markEnvelopeCompleted(supabase, envelopeId);
    return jsonResponse(200, { ok: true, idempotent: true });
  }

  if (partner.status === "suspended") {
    console.warn("DocuSign completion ignored for suspended partner.", { partnerId: partner.id });
    return jsonResponse(200, { ok: true, ignored: true, status: "suspended" });
  }

  const nextStatus = partner.status === "pending_manual_vetting" ? "pending_manual_vetting" : "certified";
  const update = await supabase
    .from("partners")
    .update({
      esign_envelope_id: envelopeId,
      status: nextStatus
    })
    .eq("id", partner.id);

  if (update.error) {
    console.error("DocuSign partner update failed.", safeLogError(update.error));
    return jsonResponse(500, { error: "Partner update failed." });
  }
  await markEnvelopeCompleted(supabase, envelopeId);

  if (nextStatus === "certified") {
    await sendCertifiedEmail(partner.email, partner.full_name, partner.referral_token);
  }

  return jsonResponse(200, { ok: true, status: nextStatus });
}

async function markEnvelopeCompleted(supabase: any, envelopeId: string) {
  const { error } = await supabase
    .from("partner_esign_envelopes")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("envelope_id", envelopeId);
  if (error) {
    console.warn("DocuSign envelope tracking update failed.", safeLogError(error));
  }
}

async function safelyVerifyDocusignHmac(body: string, secret: string, signatureHeader: string) {
  try {
    return await verifyDocusignHmac(body, secret, signatureHeader);
  } catch (error) {
    console.warn("DocuSign signature verification failed.", error);
    return false;
  }
}

function extractEnvelopeStatus(payload: any) {
  return String(
    payload.data?.envelopeSummary?.status ||
      payload.envelopeStatus?.status ||
      payload.status ||
      payload.event ||
      ""
  )
    .toLowerCase()
    .replace("envelope-", "");
}

function extractEnvelopeId(payload: any) {
  return String(
    payload.data?.envelopeId ||
      payload.envelopeId ||
      payload.envelopeStatus?.envelopeId ||
      payload.data?.envelopeSummary?.envelopeId ||
      ""
  );
}

function extractCustomField(payload: any, name: string) {
  const fields =
    payload.data?.envelopeSummary?.customFields?.textCustomFields ||
    payload.envelopeStatus?.customFields?.textCustomFields ||
    payload.customFields?.textCustomFields ||
    [];
  const field = fields.find((item: any) => item.name === name || item.fieldId === name);
  return field?.value || payload.data?.customFields?.[name] || payload.customFields?.[name] || "";
}

async function sendCertifiedEmail(email: string, fullName: string, referralToken: string) {
  const url = Deno.env.get("CERTIFIED_EMAIL_WEBHOOK_URL");
  if (!url) {
    console.info("CERTIFIED_EMAIL_WEBHOOK_URL missing; certified email skipped.", email);
    return;
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") || ""
      },
      body: JSON.stringify({ email, fullName, referralToken })
    });
    if (!response.ok) {
      console.warn("Certified email webhook returned non-OK.", { status: response.status });
    }
  } catch (error) {
    console.warn("Certified email webhook failed.", safeLogError(error));
  }
}

function parseJson(bodyText: string) {
  try {
    return JSON.parse(bodyText);
  } catch {
    throw Object.assign(new Error("Invalid JSON payload."), { statusCode: 400 });
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const timeoutMs = Number(Deno.env.get("EXTERNAL_CALL_TIMEOUT_MS") || "8000");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw Object.assign(new Error("External request timed out."), { statusCode: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeLogError(error: unknown) {
  const err = error as { code?: string; name?: string; statusCode?: number };
  return {
    code: err?.code || err?.name || "unknown",
    statusCode: err?.statusCode || 500
  };
}
