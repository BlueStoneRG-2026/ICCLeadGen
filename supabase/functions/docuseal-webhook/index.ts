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
  const secret = Deno.env.get("DOCUSEAL_WEBHOOK_SECRET") || "";
  const signature = req.headers.get("x-docuseal-signature") || req.headers.get("x-signature") || "";

  if (secret && (!signature || !(await verifyHmac(bodyText, secret, signature)))) {
    return new Response(JSON.stringify({ error: "Invalid signature." }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const payload = JSON.parse(bodyText);
  const eventText = JSON.stringify(payload).toLowerCase();
  if (!/(completed|complete|signed|submitter.completed)/.test(eventText)) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: jsonHeaders });
  }

  const envelopeId = String(
    payload.submission_id ||
      payload.submission?.id ||
      payload.data?.submission_id ||
      payload.data?.id ||
      payload.id ||
      ""
  );
  const partnerId =
    payload.metadata?.partner_id ||
    payload.data?.metadata?.partner_id ||
    payload.submission?.metadata?.partner_id ||
    payload.submitters?.[0]?.metadata?.partner_id ||
    payload.data?.submitters?.[0]?.metadata?.partner_id;

  if (!envelopeId || !partnerId) {
    return new Response(JSON.stringify({ error: "Missing envelope or partner metadata." }), {
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

async function verifyHmac(body: string, secret: string, signatureHeader: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const normalized = signatureHeader.replace(/^sha256=/, "");
  return normalized.length === hex.length && normalized === hex;
}
