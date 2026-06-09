import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("final pre-deploy readiness artifacts", () => {
  it("production env template passes the readiness gate with placeholders allowed", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/production-readiness.mjs", "--env-file", ".env.production.template", "--allow-placeholders"], {
        encoding: "utf8"
      })
    ).not.toThrow();
  });

  it("keeps dangerous production toggles unset in the template", () => {
    const env = readFileSync(".env.production.template", "utf8");
    expect(env).toContain("VITE_DEMO_MODE=false");
    expect(env).toMatch(/^LOCAL_ADMIN_BYPASS=$/m);
    expect(env).toMatch(/^ALLOW_UNSIGNED_WEBHOOKS=$/m);
    expect(env).toMatch(/^SUPABASE_FUNCTIONS_LOCAL=$/m);
    expect(env).toContain("APP_ORIGIN=https://<new-site>.netlify.app");
  });

  it("pre-stages Netlify and Supabase production config", () => {
    const netlify = readFileSync("netlify.toml", "utf8");
    const supabaseSchema = readFileSync("supabase/schema.sql", "utf8");

    expect(netlify).toContain('command = "tsc -b && vite build"');
    expect(netlify).toContain('publish = "dist"');
    expect(netlify).toContain('functions = "netlify/functions"');
    expect(netlify).toContain("Content-Security-Policy");

    [
      "0001_phase_0_2_schema.sql",
      "0002_commission_idempotency.sql",
      "0003_atomic_funding_and_rpc_grants.sql",
      "0004_outbox_events.sql",
      "0005_partner_esign_envelopes.sql",
      "0006_commission_payout_workflow.sql"
    ].reduce((previousIndex, migration) => {
      const index = supabaseSchema.indexOf(migration);
      expect(index, migration).toBeGreaterThan(previousIndex);
      return index;
    }, -1);
  });

  it("keeps production deploy scripts isolated and free of local sample-data paths", () => {
    const supabaseDeploy = readFileSync("scripts/deploy-supabase.mjs", "utf8");
    const netlifyDeploy = readFileSync("scripts/deploy-netlify.mjs", "utf8");

    expect(supabaseDeploy).toContain('["projects", "list"]');
    expect(supabaseDeploy).toContain('"--project-ref", projectRef');
    expect(supabaseDeploy).toContain('["db", "push", "--project-ref", projectRef]');
    expect(supabaseDeploy).toContain('["functions", "deploy", "sendgrid-events", "--project-ref", projectRef]');
    expect(supabaseDeploy).toContain('"--allow-missing", "SENDGRID_EVENT_PUBLIC_KEY"');
    expect(supabaseDeploy).not.toMatch(/db reset|seed\.sql|supabase\/seed/i);

    expect(netlifyDeploy).toContain('["status", "--site", expectedSiteId]');
    expect(netlifyDeploy).toContain('["deploy", "--site", siteId, "--json"]');
    expect(netlifyDeploy).toContain('["deploy", "--prod", "--site", siteId, "--json"]');
    expect(netlifyDeploy).not.toContain("netlify link");
  });

  it("documents operator-only and operator-present steps in the authoritative runbook", () => {
    const runbook = readFileSync("docs/DEPLOY_RUNBOOK.md", "utf8");
    expect(runbook).toContain("This is the authoritative deploy source of truth.");
    expect(runbook).toContain("[OPERATOR]");
    expect(runbook).toContain("[OPERATOR-PRESENT]");
    expect(runbook).toContain("[AUTOMATED]");
    expect(runbook).toContain("SendGrid Event Webhook");
    expect(runbook).toContain("--bootstrap");
    expect(runbook).toContain("full readiness without `--allow-missing` must pass");
    expect(runbook).toContain("DocuSign production go-live promotion");
    expect(runbook).toContain("`supabase/seed.sql` is local only");
    expect(runbook).toContain("landing/file-desk/file-desk/");
  });
});
