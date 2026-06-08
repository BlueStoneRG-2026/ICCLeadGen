import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifierRequired,
  verifySendGridSignature
} from "../_shared/webhook-verification.ts";

const jsonHeaders = { "content-type": "application/json" };
const suppressingEvents = new Set(["bounce", "dropped", "spamreport"]);

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("SendGrid webhook unexpected error.", safeLogError(error));
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
  const publicKey = Deno.env.get("SENDGRID_EVENT_PUBLIC_KEY") || "";

  if (
    !verifierRequired(publicKey, {
      allowUnsigned: Deno.env.get("ALLOW_UNSIGNED_WEBHOOKS") || "",
      functionsLocal: Deno.env.get("SUPABASE_FUNCTIONS_LOCAL") || "",
      supabaseUrl: Deno.env.get("SUPABASE_URL") || ""
    })
  ) {
    return jsonResponse(401, { error: "Missing SendGrid signature verification key." });
  }

  if (publicKey && !(await safelyVerifySendGridSignature(req, bodyText, publicKey))) {
    return jsonResponse(401, { error: "Invalid SendGrid signature." });
  }

  const events = parseJson(bodyText);
  const suppressions = (Array.isArray(events) ? events : [events]).flatMap(extractSuppression);

  if (!suppressions.length) {
    return jsonResponse(200, { ok: true, inserted: 0 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.from("suppression").upsert(suppressions, { onConflict: "email" });
  if (error) {
    console.error("SendGrid suppression upsert failed.", safeLogError(error));
    return jsonResponse(500, { error: "Suppression write failed." });
  }

  return jsonResponse(200, { ok: true, inserted: suppressions.length });
}

async function safelyVerifySendGridSignature(req: Request, bodyText: string, publicKeyPem: string) {
  try {
    return await verifySendGridSignature(req, bodyText, publicKeyPem);
  } catch (error) {
    console.warn("SendGrid signature verification failed.", error);
    return false;
  }
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

function safeLogError(error: unknown) {
  const err = error as { code?: string; name?: string; statusCode?: number };
  return {
    code: err?.code || err?.name || "unknown",
    statusCode: err?.statusCode || 500
  };
}
