import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const envFile = args["env-file"] || ".env.production";
const env = readEnvFile(envFile);
const siteId = args["site-id"] || env.NETLIFY_SITE_ID;
const siteName = args["site-name"] || env.NETLIFY_SITE_NAME || "icc-file-desk";
const deployProd = Boolean(args.prod);

if (!siteId || !siteName) {
  abort("Missing --site-id/--site-name or NETLIFY_SITE_ID/NETLIFY_SITE_NAME in env file.");
}

runNodeScript("scripts/production-readiness.mjs", ["--env-file", envFile]);
preflightLinkedSite(siteId);
preflightSite(siteId, siteName);

run("npm", ["run", "build"]);

const tempDir = mkdtempSync(join(tmpdir(), "icc-file-desk-netlify-env-"));
const netlifyEnvPath = join(tempDir, "netlify.env");
try {
  writeFileSync(netlifyEnvPath, renderEnv(netlifyEnvKeys(env)), { mode: 0o600 });
  run("netlify", ["env:import", netlifyEnvPath, "--site", siteId, "--context", "production"]);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const draft = run("netlify", ["deploy", "--site", siteId, "--json"], { capture: true });
printDeployUrl("Draft deploy", draft);

if (!deployProd) {
  console.log("Draft deploy completed. Re-run with --prod only after the draft URL passes the runbook checks.");
  process.exit(0);
}

const prod = run("netlify", ["deploy", "--prod", "--site", siteId, "--json"], { capture: true });
printDeployUrl("Production deploy", prod);

function preflightLinkedSite(expectedSiteId) {
  const linkedPath = ".netlify/state.json";
  if (!existsSync(linkedPath)) {
    return;
  }
  const linked = JSON.parse(readFileSync(linkedPath, "utf8"));
  if (linked.siteId && linked.siteId !== expectedSiteId) {
    abort(`Local Netlify state is linked to ${linked.siteId}, not ${expectedSiteId}. Remove .netlify/state.json or use a clean checkout.`);
  }
}

function preflightSite(expectedSiteId, expectedName) {
  run("netlify", ["status", "--site", expectedSiteId], { allowFailure: true });
  const sites = run("netlify", ["sites:list"], { capture: true });
  if (!sites.includes(expectedSiteId) || !sites.includes(expectedName)) {
    abort(`Pre-flight failed: netlify sites:list did not include both ${expectedName} and ${expectedSiteId}.`);
  }
  console.log(`Pre-flight passed for dedicated Netlify site ${expectedName} (${expectedSiteId}).`);
}

function netlifyEnvKeys(source) {
  return pick(source, [
    "VITE_DEMO_MODE",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_FUNCTION_BASE",
    "APP_ORIGIN",
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
    "VA_QUEUE_EMAIL",
    "SENDGRID_CALL_TIMEOUT_MS",
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
    "DOCUSIGN_CALL_TIMEOUT_MS",
    "INTERNAL_WEBHOOK_SECRET",
    "ADMIN_EMAILS",
    "UNDERWRITING_INTAKE_EMAIL"
  ]);
}

function pick(source, keys) {
  const selected = {};
  for (const key of keys) {
    if (!(key in source)) {
      abort(`Missing Netlify env key ${key}.`);
    }
    if (["VA_QUEUE_EMAIL"].includes(key) && !source[key]) {
      continue;
    }
    if (!source[key]) {
      abort(`Netlify env key ${key} is required.`);
    }
    selected[key] = source[key];
  }
  return selected;
}

function printDeployUrl(label, raw) {
  try {
    const parsed = JSON.parse(raw);
    console.log(`${label}: ${parsed.deploy_url || parsed.url || raw}`);
  } catch {
    console.log(`${label}: ${raw}`);
  }
}

function renderEnv(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${quoteEnv(value)}`)
    .join("\n");
}

function quoteEnv(value) {
  return JSON.stringify(String(value));
}

function runNodeScript(script, scriptArgs) {
  run(process.execPath, [script, ...scriptArgs]);
}

function run(command, commandArgs, options = {}) {
  const printable = `${command} ${commandArgs.join(" ")}`;
  console.log(`$ ${printable}`);
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env
  });
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      process.stderr.write(result.stderr || "");
    }
    abort(`Command failed: ${command} ${commandArgs[0] || ""}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function abort(message) {
  console.error(`ABORT: ${message}`);
  process.exit(1);
}

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
