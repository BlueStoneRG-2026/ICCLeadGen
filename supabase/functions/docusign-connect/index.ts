import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: jsonHeaders
    });
  }

  const bodyText = await req.text();
  const secret = Deno.env.get("DOCUSIGN_CONNECT_HMAC_SECRET") || "";
  const signature = req.headers.get("X-DocuSign-Signature-1") || "";

  if (!secret && !allowUnsignedWebhooks()) {
    return new Response(JSON.stringify({ error: "Missing DocuSign Connect HMAC secret." }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  if (secret && (!signature || !(await safelyVerifyDocusignHmac(bodyText, secret, signature)))) {
    return new Response(JSON.stringify({ error: "Invalid DocuSign signature." }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const payload = JSON.parse(bodyText);
  const status = extractEnvelopeStatus(payload);
  if (status !== "completed") {
    return new Response(JSON.stringify({ ok: true, ignored: true, status }), { headers: jsonHeaders });
  }

  const envelopeId = extractEnvelopeId(payload);
  const partnerId = extractCustomField(payload, "partner_id");

  if (!envelopeId || !partnerId) {
    return new Response(JSON.stringify({ error: "Missing envelope ID or partner custom field." }), {
      status: 422,
      headers: jsonHeaders
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const partnerResult = await supabase
    .from("partners")
    .select("id,email,full_name,status,referral_token,esign_envelope_id")
    .eq("id", partnerId)
    .single();

  if (partnerResult.error) {
    return new Response(JSON.stringify({ error: partnerResult.error.message }), {
      status: 500,
      headers: jsonHeaders
    });
  }

  const partner = partnerResult.data;
  if (partner.status === "certified" && partner.esign_envelope_id === envelopeId) {
    return new Response(JSON.stringify({ ok: true, idempotent: true }), { headers: jsonHeaders });
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
    return new Response(JSON.stringify({ error: update.error.message }), {
      status: 500,
      headers: jsonHeaders
    });
  }

  if (nextStatus === "certified") {
    await sendCertifiedEmail(partner.email, partner.full_name, partner.referral_token);
  }

  return new Response(JSON.stringify({ ok: true, status: nextStatus }), { headers: jsonHeaders });
});

async function safelyVerifyDocusignHmac(body: string, secret: string, signatureHeader: string) {
  try {
    return await verifyDocusignHmac(body, secret, signatureHeader);
  } catch (error) {
    console.warn("DocuSign signature verification failed.", error);
    return false;
  }
}

function allowUnsignedWebhooks() {
  if (Deno.env.get("ALLOW_UNSIGNED_WEBHOOKS") !== "true") {
    return false;
  }

  return isLocalSupabaseRuntime();
}

function isLocalSupabaseRuntime() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  return (
    Deno.env.get("SUPABASE_FUNCTIONS_LOCAL") === "true" ||
    supabaseUrl.includes("127.0.0.1") ||
    supabaseUrl.includes("localhost")
  );
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

  await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") || ""
    },
    body: JSON.stringify({ email, fullName, referralToken })
  });
}

async function verifyDocusignHmac(body: string, secret: string, signatureHeader: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = bytesToBase64(new Uint8Array(digest));
  return constantTimeEqual(expected, signatureHeader.trim());
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
