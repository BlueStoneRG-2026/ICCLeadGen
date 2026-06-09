import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const base = requiredEnv("LIVE_FUNCTION_BASE").replace(/\/$/, "");
const supabaseUrl = requiredEnv("SUPABASE_URL");
const anonKey = requiredEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const adminEmail = requiredEnv("SMOKE_ADMIN_EMAIL");
const adminPassword = requiredEnv("SMOKE_ADMIN_PASSWORD");
const partnerEmail = requiredEnv("SMOKE_PARTNER_EMAIL");
const partnerName = envValue("SMOKE_PARTNER_NAME") || "ICC Smoke Partner";
const firmName = envValue("SMOKE_PARTNER_FIRM") || "Smoke File Desk";
const merchantName = `Smoke Amazon Seller ${Date.now()}`;

if (!base.startsWith("https://")) {
  throw new Error("LIVE_FUNCTION_BASE must be the https production Netlify functions URL.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

console.log("Smoke 1/8: unauthenticated admin endpoint returns safe 401.");
await expectStatus(`${base}/admin-data`, { method: "GET" }, 401);

console.log("Smoke 2/8: admin Supabase Auth sign-in succeeds.");
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const signIn = await anon.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
if (signIn.error || !signIn.data.session?.access_token) {
  throw new Error(`Admin sign-in failed: ${signIn.error?.message || "missing session"}`);
}
const adminToken = signIn.data.session.access_token;

console.log("Smoke 3/8: intake accepts a test Amazon CSV and returns checker/routing result.");
const intakeForm = new FormData();
intakeForm.set("email", partnerEmail);
intakeForm.set("fullName", partnerName);
intakeForm.set("firmName", firmName);
intakeForm.set("merchantName", merchantName);
intakeForm.set("referrerType", "broker_mca");
intakeForm.set(
  "statement",
  new Blob(
    [
      [
        "Date,Description,Amount,Balance",
        "2026-06-01,AMZN settlement deposit credit payout gross revenue,18400,62000",
        "2026-06-03,Amazon Seller Central ACH credit,9600,71600"
      ].join("\n")
    ],
    { type: "text/csv" }
  ),
  `smoke-${randomUUID()}.csv`
);
const intake = await request("intake", { method: "POST", body: intakeForm });
if (!intake.submissionId || !["likely_fundable", "needs_review", "out_of_box"].includes(intake.checkerDecision)) {
  throw new Error(`Unexpected intake response: ${JSON.stringify(intake)}`);
}

console.log("Smoke 4/8: admin sends the test submission to underwriting.");
await adminAction(adminToken, { action: "send_to_underwriting", submissionId: intake.submissionId });

console.log("Smoke 5/8: admin marks the test submission funded.");
await adminAction(adminToken, {
  action: "mark_funded",
  submissionId: intake.submissionId,
  fundedAmount: 25000,
  isRenewal: false
});

console.log("Smoke 6/8: admin clears first-funded review, authorizes, and marks paid.");
const commission = await findCommission(intake.submissionId);
await adminAction(adminToken, { action: "clear_commission_review", commissionId: commission.id });
await adminAction(adminToken, { action: "authorize_commission_payout", commissionId: commission.id });
await adminAction(adminToken, { action: "mark_commission_paid", commissionId: commission.id });

console.log("Smoke 7/8: SendGrid and DocuSign Edge Functions fail closed without signatures.");
await expectStatus(`${supabaseUrl.replace(".supabase.co", ".functions.supabase.co")}/sendgrid-events`, { method: "POST", body: "[]" }, 401);
await expectStatus(`${supabaseUrl.replace(".supabase.co", ".functions.supabase.co")}/docusign-connect`, { method: "POST", body: "{}" }, 401);

console.log("Smoke 8/8: live cross-partner RLS test passes and cleans up.");
const rls = spawnSync(process.execPath, ["scripts/rls-cross-partner-test.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
  }
});
if (rls.status !== 0) {
  throw new Error("Live cross-partner RLS test failed.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      base,
      partnerEmail,
      submissionId: intake.submissionId,
      checkerDecision: intake.checkerDecision,
      commissionId: commission.id
    },
    null,
    2
  )
);

async function adminAction(token, payload) {
  return request("admin-action", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function findCommission(submissionId) {
  const { data, error } = await admin
    .from("commissions")
    .select("id,payout_state,first_funded_review_cleared")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(`Could not find smoke commission: ${error?.message || "missing row"}`);
  }
  return data;
}

async function request(path, init) {
  const response = await fetch(`${base}/${path}`, init);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function expectStatus(url, init, status) {
  const response = await fetch(url, init);
  if (response.status !== status) {
    const body = await response.text();
    throw new Error(`Expected ${status} from ${url}, got ${response.status}: ${body}`);
  }
}

function requiredEnv(name) {
  const value = envValue(name);
  if (!value) {
    throw new Error(`Missing ${name}. See docs/DEPLOY_RUNBOOK.md smoke-test section.`);
  }
  return value;
}

function envValue(name) {
  return process.env[name];
}
