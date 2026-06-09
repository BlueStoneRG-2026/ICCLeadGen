import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const envFile = args["env-file"] || ".env.production";
const env = readEnvFile(envFile);
const projectRef = args["project-ref"] || env.SUPABASE_PROJECT_REF;
const projectName = args["project-name"] || env.SUPABASE_PROJECT_NAME || "icc-file-desk";
const bootstrap = Boolean(args.bootstrap);

if (!projectRef || !projectName) {
  abort("Missing --project-ref/--project-name or SUPABASE_PROJECT_REF/SUPABASE_PROJECT_NAME in env file.");
}

const readinessArgs = ["--env-file", envFile];
if (bootstrap) {
  readinessArgs.push("--allow-missing", "SENDGRID_EVENT_PUBLIC_KEY");
}
runNodeScript("scripts/production-readiness.mjs", readinessArgs);
preflightProject(projectRef, projectName);

run("supabase", ["link", "--project-ref", projectRef]);
run("supabase", ["db", "push", "--project-ref", projectRef]);

run("supabase", ["secrets", "unset", "ALLOW_UNSIGNED_WEBHOOKS", "SUPABASE_FUNCTIONS_LOCAL", "--project-ref", projectRef], {
  allowFailure: true
});

const tempDir = mkdtempSync(join(tmpdir(), "icc-file-desk-edge-secrets-"));
const edgeEnvPath = join(tempDir, "edge.env");
try {
  writeFileSync(edgeEnvPath, renderEnv(edgeSecretKeys(env, bootstrap)), { mode: 0o600 });
  run("supabase", ["secrets", "set", "--project-ref", projectRef, "--env-file", edgeEnvPath]);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

run("supabase", ["functions", "deploy", "sendgrid-events", "--project-ref", projectRef]);
run("supabase", ["functions", "deploy", "docusign-connect", "--project-ref", projectRef]);
runNodeScript("scripts/verify-supabase-production.mjs", ["--env-file", envFile]);

console.log("Supabase deploy script completed. Record the Edge Function URLs before configuring SendGrid and DocuSign:");
console.log(`- https://${projectRef}.functions.supabase.co/sendgrid-events`);
console.log(`- https://${projectRef}.functions.supabase.co/docusign-connect`);
if (bootstrap) {
  console.log("Bootstrap mode completed without SENDGRID_EVENT_PUBLIC_KEY.");
  console.log("Create the SendGrid File Desk webhook, copy its signed-event public key, then rerun this script without --bootstrap.");
}

function preflightProject(ref, name) {
  const status = run("supabase", ["projects", "list"], { capture: true });
  if (!status.includes(ref) || !status.includes(name)) {
    abort(`Pre-flight failed: supabase projects list did not include both ${name} and ${ref}.`);
  }
  console.log(`Pre-flight passed for dedicated Supabase project ${name} (${ref}).`);
}

function edgeSecretKeys(source, omitSendGridPublicKey) {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DOCUSIGN_CONNECT_HMAC_SECRET",
    "CERTIFIED_EMAIL_WEBHOOK_URL",
    "INTERNAL_WEBHOOK_SECRET",
    "EXTERNAL_CALL_TIMEOUT_MS"
  ];
  if (!omitSendGridPublicKey) {
    keys.push("SENDGRID_EVENT_PUBLIC_KEY");
  }
  return pick(source, keys);
}

function pick(source, keys) {
  const selected = {};
  for (const key of keys) {
    if (!source[key]) {
      abort(`Missing required Edge Function secret ${key}.`);
    }
    selected[key] = source[key];
  }
  return selected;
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
  console.log(`$ ${redact(printable)}`);
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

function redact(value) {
  return value.replace(/(SERVICE_ROLE_KEY|PRIVATE_KEY|SECRET|API_KEY)=\S+/g, "$1=[redacted]");
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
