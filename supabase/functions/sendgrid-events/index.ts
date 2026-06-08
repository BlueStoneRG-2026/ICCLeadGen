import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifierRequired,
  verifySendGridSignature
} from "../_shared/webhook-verification.ts";

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

  if (
    !verifierRequired(publicKey, {
      allowUnsigned: Deno.env.get("ALLOW_UNSIGNED_WEBHOOKS") || "",
      functionsLocal: Deno.env.get("SUPABASE_FUNCTIONS_LOCAL") || "",
      supabaseUrl: Deno.env.get("SUPABASE_URL") || ""
    })
  ) {
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
