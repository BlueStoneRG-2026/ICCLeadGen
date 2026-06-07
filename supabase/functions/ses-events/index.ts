import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: jsonHeaders
    });
  }

  const configuredSecret = Deno.env.get("SES_EVENTS_SECRET") || "";
  const requestSecret = req.headers.get("x-ses-events-secret") || "";
  if (configuredSecret && configuredSecret !== requestSecret) {
    return new Response(JSON.stringify({ error: "Invalid SES events secret." }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const payload = await req.json();
  const records = Array.isArray(payload.Records)
    ? payload.Records.map((record: any) => JSON.parse(record.Sns?.Message || "{}"))
    : [payload];

  const suppressions = records.flatMap(extractSuppressions);
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

function extractSuppressions(message: any) {
  const type = String(message.eventType || message.notificationType || "").toLowerCase();
  if (!["bounce", "complaint", "unsubscribe"].includes(type)) {
    return [];
  }

  const emails = new Set<string>();
  message.bounce?.bouncedRecipients?.forEach((recipient: any) => emails.add(recipient.emailAddress));
  message.complaint?.complainedRecipients?.forEach((recipient: any) => emails.add(recipient.emailAddress));
  message.mail?.destination?.forEach((email: string) => emails.add(email));
  message.destination?.forEach((email: string) => emails.add(email));

  return [...emails].filter(Boolean).map((email) => ({
    email: email.toLowerCase(),
    reason: type
  }));
}
