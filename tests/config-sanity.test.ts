import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appOwnedEnv = new Set([
  "ADMIN_EMAILS",
  "ALLOW_NONLOCAL_FLOW",
  "ALLOW_UNSIGNED_WEBHOOKS",
  "APP_ORIGIN",
  "CERTIFIED_EMAIL_WEBHOOK_URL",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_AUTH_SERVER",
  "DOCUSIGN_BASE_PATH",
  "DOCUSIGN_CONNECT_HMAC_SECRET",
  "DOCUSIGN_CALL_TIMEOUT_MS",
  "DOCUSIGN_FIELD_MAP_JSON",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_ISO_TEMPLATE_ID",
  "DOCUSIGN_PRIVATE_KEY",
  "DOCUSIGN_RETURN_URL",
  "DOCUSIGN_TEMPLATE_ROLE_NAME",
  "DOCUSIGN_USER_ID",
  "INTERNAL_WEBHOOK_SECRET",
  "EXTERNAL_CALL_TIMEOUT_MS",
  "LOCAL_ADMIN_BYPASS",
  "LOCAL_FUNCTION_BASE",
  "REPLY_TO_EMAIL",
  "SENDGRID_API_KEY",
  "SENDGRID_CALL_TIMEOUT_MS",
  "SENDGRID_EVENT_PUBLIC_KEY",
  "SENDING_DOMAIN",
  "SUBMISSION_BUCKET",
  "SUPABASE_ANON_KEY",
  "SUPABASE_CALL_TIMEOUT_MS",
  "SUPABASE_FUNCTIONS_LOCAL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "TRANSACTIONAL_FROM",
  "UNDERWRITING_INTAKE_EMAIL",
  "UNSUBSCRIBE_URL",
  "VA_QUEUE_EMAIL",
  "VITE_DEMO_MODE",
  "VITE_FUNCTION_BASE",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_URL"
]);

const platformEnv = new Set(["CONTEXT", "NETLIFY", "NETLIFY_DEV", "NODE_ENV", "URL"]);

describe("configuration sanity", () => {
  it("keeps .env.example aligned with app-owned env vars used by code and scripts", () => {
    const envExample = readFileSync(".env.example", "utf8");
    const documented = new Set(
      envExample
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
        .filter(Boolean) as string[]
    );

    const used = extractEnvNames(["netlify/functions", "supabase/functions", "src", "scripts"]);
    const unexpected = [...used].filter((name) => !appOwnedEnv.has(name) && !platformEnv.has(name));
    const missing = [...used].filter((name) => appOwnedEnv.has(name) && !documented.has(name));

    expect(unexpected).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("does not reference SES, Vercel, or DocuSeal in active runtime code", () => {
    const files = walk(["netlify/functions", "supabase/functions", "src", "scripts", ".env.example"]);
    const offenders = files.filter((file) => /SES_|Amazon SES|Vercel|DocuSeal|docuseal/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps any DocuSeal/n8n/VPS references clearly Phase 3-only", () => {
    const files = walk(["README.md", "docs/DEPLOY_CHECKLIST.md", "docs/DEPLOY_RUNBOOK.md", "docs/DEPLOYMENT.md", "docs/handoff"]);
    const ambiguous = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter(
          (line) =>
            /DocuSeal|n8n|VPS/.test(line) &&
            !/Phase 3|deferred|future free e-sign fallback|Do not deploy|not n8n|without VPS|06_WORKFLOWS_n8n\.md/i.test(
              line
            )
        )
        .map((line) => `${file}: ${line}`)
    );
    expect(ambiguous).toEqual([]);
  });
});

function extractEnvNames(paths: string[]) {
  const names = new Set<string>();
  walk(paths).forEach((file) => {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:env\("|process\.env\.|Deno\.env\.get\("|import\.meta\.env\.)([A-Z0-9_]+)/g)) {
      names.add(match[1]);
    }
  });
  return names;
}

function walk(paths: string[]) {
  return paths.flatMap((path) => {
    if (!statSync(path).isDirectory()) {
      return [path];
    }

    return readdirSync(path).flatMap((entry) => {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        return walk([full]);
      }
      return /\.(ts|tsx|js|mjs|md|example)$/.test(full) ? [full] : [];
    });
  });
}
