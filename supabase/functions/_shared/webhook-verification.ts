export interface UnsignedWebhookConfig {
  allowUnsigned?: string;
  supabaseUrl?: string;
  functionsLocal?: string;
}

export function unsignedWebhookAllowed(config: UnsignedWebhookConfig) {
  if (config.allowUnsigned !== "true") {
    return false;
  }

  return (
    config.functionsLocal === "true" ||
    (config.supabaseUrl || "").includes("127.0.0.1") ||
    (config.supabaseUrl || "").includes("localhost")
  );
}

export function verifierRequired(value: string, config: UnsignedWebhookConfig) {
  return Boolean(value) || unsignedWebhookAllowed(config);
}

export async function verifyDocusignHmac(body: string, secret: string, signatureHeader: string) {
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

export async function verifySendGridSignature(req: Request, bodyText: string, publicKeyPem: string) {
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

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
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

