import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const envFile = args["env-file"] || ".env.production.template";
const allowPlaceholders = Boolean(args["allow-placeholders"]);
const allowMissing = new Set(String(args["allow-missing"] || "").split(",").map((item) => item.trim()).filter(Boolean));
const env = readEnvFile(envFile);
const failures = [];

const requiredRuntimeKeys = [
  "APP_ORIGIN",
  "VITE_DEMO_MODE",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_FUNCTION_BASE",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUBMISSION_BUCKET",
  "SUPABASE_CALL_TIMEOUT_MS",
  "SENDGRID_API_KEY",
  "SENDING_DOMAIN",
  "TRANSACTIONAL_FROM",
  "REPLY_TO_EMAIL",
  "UNSUBSCRIBE_URL",
  "SENDGRID_CALL_TIMEOUT_MS",
  "SENDGRID_EVENT_PUBLIC_KEY",
  "DOCUSIGN_AUTH_SERVER",
  "DOCUSIGN_BASE_PATH",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_PRIVATE_KEY",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_ISO_TEMPLATE_ID",
  "DOCUSIGN_TEMPLATE_ROLE_NAME",
  "DOCUSIGN_RETURN_URL",
  "DOCUSIGN_FIELD_MAP_JSON",
  "DOCUSIGN_ENVELOPE_VALID_DAYS",
  "DOCUSIGN_CONNECT_HMAC_SECRET",
  "DOCUSIGN_CALL_TIMEOUT_MS",
  "CERTIFIED_EMAIL_WEBHOOK_URL",
  "INTERNAL_WEBHOOK_SECRET",
  "EXTERNAL_CALL_TIMEOUT_MS",
  "ADMIN_EMAILS",
  "UNDERWRITING_INTAKE_EMAIL"
];

const optionalRuntimeKeys = ["VA_QUEUE_EMAIL"];
const safetyUnsetKeys = ["LOCAL_ADMIN_BYPASS", "ALLOW_UNSIGNED_WEBHOOKS", "SUPABASE_FUNCTIONS_LOCAL"];
const deployTargetKeys = ["SUPABASE_PROJECT_REF", "SUPABASE_PROJECT_NAME", "NETLIFY_SITE_ID", "NETLIFY_SITE_NAME"];

for (const key of [...requiredRuntimeKeys, ...optionalRuntimeKeys, ...safetyUnsetKeys, ...deployTargetKeys]) {
  if (!(key in env)) {
    failures.push(`${key} is missing from ${envFile}.`);
  }
}

if (!allowPlaceholders) {
  for (const key of requiredRuntimeKeys) {
    if (!allowMissing.has(key)) {
      assertPresent(key);
    }
  }
}

if (!allowPlaceholders) {
  for (const key of deployTargetKeys) {
    assertPresent(key);
  }
}

if (env.VITE_DEMO_MODE !== "false") {
  failures.push("VITE_DEMO_MODE must be false in production.");
}

for (const key of safetyUnsetKeys) {
  const value = (env[key] || "").trim();
  if (value) {
    failures.push(`${key} must be unset/blank in production, not ${JSON.stringify(value)}.`);
  }
}

if (!allowPlaceholders) {
  const placeholderKeys = Object.entries(env)
    .filter(([key, value]) => !allowMissing.has(key) && /<[^>]+>|CHANGE_ME|TODO|REPLACE_ME/i.test(value || ""))
    .map(([key]) => key);
  if (placeholderKeys.length) {
    failures.push(`Placeholder values remain in: ${placeholderKeys.join(", ")}.`);
  }
}

if (!/^https:\/\/[^*]+/.test(env.APP_ORIGIN || "")) {
  failures.push("APP_ORIGIN must be a single https origin, never * or localhost.");
}
if (/localhost|127\.0\.0\.1|\*/i.test(env.APP_ORIGIN || "")) {
  failures.push("APP_ORIGIN is unsafe for production.");
}
if (env.DOCUSIGN_AUTH_SERVER !== "account.docusign.com") {
  failures.push("DOCUSIGN_AUTH_SERVER must be account.docusign.com for production.");
}
if (env.DOCUSIGN_BASE_PATH !== "https://www.docusign.net/restapi") {
  failures.push("DOCUSIGN_BASE_PATH must be https://www.docusign.net/restapi for production.");
}
if (env.SENDING_DOMAIN !== "partners.ironcrowncapital.com") {
  failures.push("SENDING_DOMAIN must remain partners.ironcrowncapital.com for this deploy.");
}

assertNoSeedInProductionPath();
assertNetlifyConfig();
assertSupabaseMigrationOrder();
assertNoTrackedSecretFiles();
assertCodeEnvMatchesTemplate();

if (failures.length) {
  console.error("Production readiness failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Production readiness passed for ${envFile}${allowPlaceholders ? " (template placeholders allowed)" : ""}.`);

function assertPresent(key) {
  const value = (env[key] || "").trim();
  if (!value) {
    failures.push(`${key} is required.`);
  }
}

function assertNoSeedInProductionPath() {
  const deploySupabase = readOptional("scripts/deploy-supabase.mjs");
  if (/db reset|seed\.sql|supabase\/seed/i.test(deploySupabase)) {
    failures.push("Production Supabase deploy script references seed/reset. seed.sql is local-only.");
  }
}

function assertNetlifyConfig() {
  const config = readOptional("netlify.toml");
  if (!/command = "tsc -b && vite build"/.test(config)) {
    failures.push("netlify.toml build command must be exactly tsc -b && vite build.");
  }
  if (!/publish = "dist"/.test(config) || !/functions = "netlify\/functions"/.test(config)) {
    failures.push("netlify.toml must publish dist and use netlify/functions.");
  }
  if (!/Content-Security-Policy/.test(config) || !/frame-ancestors 'none'/.test(config)) {
    failures.push("netlify.toml must include CSP/security headers.");
  }
}

function assertSupabaseMigrationOrder() {
  const schema = readOptional("supabase/schema.sql");
  const expected = [
    "0001_phase_0_2_schema.sql",
    "0002_commission_idempotency.sql",
    "0003_atomic_funding_and_rpc_grants.sql",
    "0004_outbox_events.sql",
    "0005_partner_esign_envelopes.sql",
    "0006_commission_payout_workflow.sql"
  ];
  let cursor = -1;
  for (const migration of expected) {
    const index = schema.indexOf(migration);
    if (index <= cursor) {
      failures.push(`supabase/schema.sql migration order is wrong or missing ${migration}.`);
      return;
    }
    cursor = index;
  }
}

function assertNoTrackedSecretFiles() {
  try {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    const allowedEnvFiles = new Set([".env.example", ".env.production.template"]);
    const forbidden = tracked.filter(
      (file) => !allowedEnvFiles.has(file) && (/^\.env($|\.)|\.pem$|private[-_]?key/i.test(file))
    );
    if (forbidden.length) {
      failures.push(`Secret-like files are tracked: ${forbidden.join(", ")}.`);
    }
  } catch {
    // Git may be unavailable in CI-like smoke environments; other checks still run.
  }
}

function assertCodeEnvMatchesTemplate() {
  const sourceDirs = ["netlify/functions", "supabase/functions", "src"];
  const source = sourceDirs.map(readTree).join("\n");
  const used = new Set();
  for (const match of source.matchAll(/(?:env\("|process\.env\.|Deno\.env\.get\("|import\.meta\.env\.)([A-Z0-9_]+)/g)) {
    const key = match[1];
    if (!["CONTEXT", "NETLIFY", "NETLIFY_DEV", "NODE_ENV", "URL"].includes(key)) {
      used.add(key);
    }
  }
  const missing = [...used].filter((key) => !(key in env));
  if (missing.length) {
    failures.push(`Runtime env vars used by code are missing from ${envFile}: ${missing.join(", ")}.`);
  }
}

function readTree(path) {
  return execFileSync("find", [path, "-type", "f", "(", "-name", "*.ts", "-o", "-name", "*.tsx", "-o", "-name", "*.js", "-o", "-name", "*.mjs", ")"], {
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(readOptional)
    .join("\n");
}

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Missing env file: ${path}`);
    process.exit(1);
  }
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
