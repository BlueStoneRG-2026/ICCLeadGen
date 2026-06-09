import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));
const envFile = args["env-file"] || ".env.production";
const env = readEnvFile(envFile);

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) {
  if (!env[key]) {
    abort(`Missing ${key} for Supabase verification.`);
  }
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const tables = [
  "partners",
  "submissions",
  "commissions",
  "suppression",
  "rate_limits",
  "outbox_events",
  "partner_esign_envelopes",
  "commission_payout_audit"
];

for (const table of tables) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    abort(`Table check failed for ${table}: ${error.message}`);
  }
}

const buckets = await supabase.storage.listBuckets();
if (buckets.error) {
  abort(`Could not list storage buckets: ${buckets.error.message}`);
}
const submissionBucket = buckets.data.find((bucket) => bucket.name === (env.SUBMISSION_BUCKET || "submission-files"));
if (!submissionBucket) {
  abort("Missing submission-files storage bucket.");
}
if (submissionBucket.public) {
  abort("submission-files bucket must be private.");
}

const rls = spawnSync(process.execPath, ["scripts/rls-cross-partner-test.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
  }
});
if (rls.status !== 0) {
  abort("Live cross-partner RLS test failed.");
}

console.log("Supabase production verification passed: schema, private bucket, and cross-partner RLS.");

function readEnvFile(path) {
  const result = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    result[match[1]] = stripQuotes(match[2].trim());
  }
  return result;
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function abort(message) {
  console.error(`ABORT: ${message}`);
  process.exit(1);
}
