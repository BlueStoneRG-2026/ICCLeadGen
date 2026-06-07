import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "content-type": "application/json" };
const suppressingEvents = new Set(["bounce", "dropped", "spamreport"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: jsonHeaders
    });
  }

  const bodyText = await req.text();
  const publicKey = Deno.env.get("SENDGRID_EVENT_PUBLIC_KEY") || "";

  if (!publicKey && !allowUnsignedWebhooks()) {
    return new Response(JSON.stringify({ error: "Missing SendGrid signature verification key." }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  if (publicKey && !(await safelyVerifySendGridSignature(req, bodyText, publicKey))) {
    return new Response(JSON.stringify({ error: "Invalid SendGrid signature." }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const events = JSON.parse(bodyText);
  const suppressions = (Array.isArray(events) ? events : [events]).flatMap(extractSuppression);

  if (!suppressions.length) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), { headers: jsonHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.from("suppression").upsert(suppressions, { onConflict: "email" });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: jsonHeaders
    });
  }

  return new Response(JSON.stringify({ ok: true, inserted: suppressions.length }), {
    headers: jsonHeaders
  });
});

async function safelyVerifySendGridSignature(req: Request, bodyText: string, publicKeyPem: string) {
  try {
    return await verifySendGridSignature(req, bodyText, publicKeyPem);
  } catch (error) {
    console.warn("SendGrid signature verification failed.", error);
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

async function verifySendGridSignature(req: Request, bodyText: string, publicKeyPem: string) {
  const signatureHeader = req.headers.get("X-Twilio-Email-Event-Webhook-Signature") || "";
  const timestamp = req.headers.get("X-Twilio-Email-Event-Webhook-Timestamp") || "";

  if (!signatureHeader || !timestamp) {
    return false;
  }

  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const signature = derEcdsaToP1363(base64ToBytes(signatureHeader), 32);
  const payload = new TextEncoder().encode(`${timestamp}${bodyText}`);

  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, payload);
}

function extractSuppression(event: any) {
  const eventType = String(event.event || "").toLowerCase();
  const email = String(event.email || "").toLowerCase();

  if (!suppressingEvents.has(eventType) || !email) {
    return [];
  }

  return [
    {
      email,
      reason: eventType
    }
  ];
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(base64).buffer;
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function derEcdsaToP1363(der: Uint8Array, partLength: number) {
  let offset = 0;
  if (der[offset++] !== 0x30) {
    throw new Error("Invalid ECDSA DER sequence.");
  }
  const sequenceLength = readLength(der, offset);
  offset = sequenceLength.offset;

  const r = readInteger(der, offset);
  offset = r.offset;
  const s = readInteger(der, offset);

  return concatFixed(r.value, s.value, partLength);
}

function readLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset++];
  if (first < 0x80) {
    return { length: first, offset };
  }
  const count = first & 0x7f;
  let length = 0;
  for (let index = 0; index < count; index += 1) {
    length = (length << 8) + bytes[offset++];
  }
  return { length, offset };
}

function readInteger(bytes: Uint8Array, offset: number) {
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid ECDSA integer.");
  }
  const length = readLength(bytes, offset);
  offset = length.offset;
  const value = bytes.slice(offset, offset + length.length);
  return { value, offset: offset + length.length };
}

function concatFixed(r: Uint8Array, s: Uint8Array, partLength: number) {
  const out = new Uint8Array(partLength * 2);
  out.set(trimAndPad(r, partLength), 0);
  out.set(trimAndPad(s, partLength), partLength);
  return out;
}

function trimAndPad(value: Uint8Array, length: number) {
  const trimmed = value.length > length ? value.slice(value.length - length) : value;
  const out = new Uint8Array(length);
  out.set(trimmed, length - trimmed.length);
  return out;
}
