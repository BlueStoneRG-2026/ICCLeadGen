# ICC Amazon File Desk Production Deploy Runbook

This is the authoritative deploy source of truth. Do not deploy from loose ZIPs. Do not use browser shortcuts unless this runbook explicitly marks the step `[OPERATOR]` or `[OPERATOR-PRESENT]`. Do not touch existing Netlify sites, Supabase projects, SendGrid domains/webhooks, DocuSign templates/apps/Connect configs, Wix DNS records, or any unrelated account setting.

Tags:
- `[OPERATOR]`: Juan provides a key/credential/value or makes an account-security decision.
- `[OPERATOR-PRESENT]`: irreversible, account-level, or external-account configuration. Juan must be present and approve the screen/action.
- `[AUTOMATED]`: Codex can run it later after values are supplied and Juan is present where required.

Golden isolation rules:
- New dedicated Supabase project only: expected name `icc-file-desk`.
- New dedicated Netlify site only: expected name `icc-file-desk`.
- Every Supabase command uses explicit `--project-ref <new-project-ref>`.
- Every Netlify command uses explicit `--site <new-site-id>`.
- SendGrid Event Webhook: check for existing webhooks first; never overwrite. Create a separate File Desk webhook.
- DNS: additive records only. Never edit/delete existing records.
- `supabase/seed.sql` is local only. Production deploy uses migrations `0001` through `0006` only and never runs a database reset.

## Lead-Time Items To Start Early

1. `[OPERATOR-PRESENT]` DocuSign production go-live promotion.
   - Start first. It can require DocuSign review and lead time before JWT/API production sending is approved.
   - Abort/rollback: no repo rollback; if rejected, production e-sign stays blocked until DocuSign approves.

2. `[OPERATOR-PRESENT]` SendGrid domain authentication and sender warmup.
   - DNS can take minutes to 48 hours. Sender reputation improves gradually.
   - Abort/rollback: remove only the new additive File Desk DNS records if needed; do not touch existing SendGrid domains.

3. `[OPERATOR-PRESENT]` DNS propagation for `partners.ironcrowncapital.com`.
   - Default Netlify subdomain is used first. Custom domain waits until default-domain smoke passes.
   - Abort/rollback: remove only new `partners` records added for this app.

4. `[OPERATOR-PRESENT]` Netlify custom-domain SSL issuance.
   - SSL can take several minutes after DNS points correctly.
   - Abort/rollback: detach only the new custom domain from the new File Desk site.

## Phase 0: Repo And Local Preflight

### 0.1 Confirm Final Source

`[AUTOMATED]`

Commands:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
```

Expected output:
- `git status --short` returns no modified files.
- `main` contains only approved/merged PRs.

Verify:

```bash
git log --oneline -5
```

Abort/rollback:
- Abort if working tree is dirty or PRs are not merged.
- Do not deploy from a feature branch unless Juan explicitly approves the exact SHA.

### 0.2 Run Local Gates

`[AUTOMATED]`

Commands:

```bash
npm ci
npm run build
npm test
npm audit --audit-level=moderate
npm run readiness:prod -- --env-file .env.production.template --allow-placeholders
```

Expected output:
- Build exits `0`.
- Tests pass.
- Audit reports `found 0 vulnerabilities`.
- Readiness reports `Production readiness passed`.

Abort/rollback:
- Abort if any command fails.
- Fix in a PR; do not patch production manually.

## Phase 1: Production Env File

### 1.1 Create Local Filled Env File

`[OPERATOR]`

Command:

```bash
cp .env.production.template .env.production
```

Fill `.env.production` locally only. Never commit it.

Expected output:
- No terminal output.

Verify:

```bash
git status --short -- .env.production
```

Expected:
- No output because `.env.production` is ignored.

Abort/rollback:
- If `.env.production` appears in `git status`, stop and fix `.gitignore` before continuing.

### 1.2 Operator Values Required

`[OPERATOR]`

Fill these values in `.env.production`:

Supabase:
- `SUPABASE_PROJECT_REF`
- `SUPABASE_PROJECT_NAME=icc-file-desk`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Netlify:
- `NETLIFY_SITE_ID`
- `NETLIFY_SITE_NAME=icc-file-desk`
- `APP_ORIGIN`

SendGrid:
- `SENDGRID_API_KEY`
- `SENDGRID_EVENT_PUBLIC_KEY` after webhook signed verification is enabled in Phase 4.3
- `SENDING_DOMAIN=partners.ironcrowncapital.com`
- `TRANSACTIONAL_FROM`
- `REPLY_TO_EMAIL`
- `UNSUBSCRIBE_URL`
- optional `VA_QUEUE_EMAIL`

DocuSign:
- `DOCUSIGN_INTEGRATION_KEY`
- `DOCUSIGN_USER_ID`
- `DOCUSIGN_PRIVATE_KEY`
- `DOCUSIGN_ACCOUNT_ID`
- `DOCUSIGN_ISO_TEMPLATE_ID`
- `DOCUSIGN_TEMPLATE_ROLE_NAME`
- `DOCUSIGN_RETURN_URL`
- `DOCUSIGN_FIELD_MAP_JSON`
- `DOCUSIGN_CONNECT_HMAC_SECRET`

Internal/admin:
- `CERTIFIED_EMAIL_WEBHOOK_URL`
- `INTERNAL_WEBHOOK_SECRET`
- `ADMIN_EMAILS`
- `UNDERWRITING_INTAKE_EMAIL`

Safety values:
- `VITE_DEMO_MODE=false`
- `LOCAL_ADMIN_BYPASS=` blank/unset
- `ALLOW_UNSIGNED_WEBHOOKS=` blank/unset
- `SUPABASE_FUNCTIONS_LOCAL=` blank/unset
- `APP_ORIGIN=https://<exact-live-origin>` with no wildcard

Verify:

```bash
npm run readiness:prod -- --env-file .env.production
```

Expected output:
- `Production readiness passed for .env.production.`

Exception for the first Supabase bootstrap only:

```bash
npm run readiness:prod -- --env-file .env.production --allow-missing SENDGRID_EVENT_PUBLIC_KEY
```

Use this exception only before the SendGrid Event Webhook exists. After Phase 4.3, full readiness without `--allow-missing` must pass.

Abort/rollback:
- Abort if placeholders remain, demo mode is on, webhooks are unsigned, admin bypass is set, CORS is open, or a required env is missing.

## Phase 2: Supabase Setup And Deploy

### 2.1 Create New Supabase Project

`[OPERATOR-PRESENT]`

In Supabase:
1. Create a brand-new project.
2. Organization: correct operator organization only.
3. Project name: `icc-file-desk`.
4. Region: closest to users, default US East is acceptable.
5. Database password: generated strong password; store in password manager.
6. Do not connect GitHub auto-migrations for production deploy.

Expected output:
- Supabase dashboard shows project `icc-file-desk`.
- Project URL looks like `https://<new-ref>.supabase.co`.

Verify:
- Copy project ref into `.env.production` as `SUPABASE_PROJECT_REF`.
- Copy API URL/anon/service-role keys into `.env.production`.

Abort/rollback:
- If the project name/ref is not the new dedicated project, stop.
- If a wrong project was created, delete only the new incorrect project after confirming no data exists.

### 2.2 Supabase Preflight

`[AUTOMATED]`

Before this step, the new Netlify site shell may already exist so `.env.production` can use its default `*.netlify.app` URLs. Creating the Netlify shell is not an app deploy and must still follow the Netlify isolation rules in Phase 3.1.

Commands:

```bash
supabase projects list
npm run readiness:prod -- --env-file .env.production --allow-missing SENDGRID_EVENT_PUBLIC_KEY
```

Expected output:
- `supabase projects list` includes `icc-file-desk` and the exact `SUPABASE_PROJECT_REF`.
- Bootstrap readiness passes with only `SENDGRID_EVENT_PUBLIC_KEY` missing.

Abort/rollback:
- Abort if the list resolves to any existing/other project or the name/ref does not match.

### 2.3 Bootstrap Supabase Migrations, Secrets, And Edge Functions

`[AUTOMATED]`

Command:

```bash
npm run deploy:supabase -- --env-file .env.production --project-ref <new-project-ref> --project-name icc-file-desk --bootstrap
```

The `--bootstrap` flag exists only because SendGrid's signed-webhook public key is generated after the Edge Function endpoint exists. It omits only `SENDGRID_EVENT_PUBLIC_KEY`. The `sendgrid-events` function still fails closed until the key is installed in Phase 4.3.

The script runs these targeted commands:

```bash
supabase link --project-ref <new-project-ref>
supabase db push --project-ref <new-project-ref>
supabase secrets unset ALLOW_UNSIGNED_WEBHOOKS SUPABASE_FUNCTIONS_LOCAL --project-ref <new-project-ref>
supabase secrets set --project-ref <new-project-ref> --env-file <temporary-edge-secret-file>
supabase functions deploy sendgrid-events --project-ref <new-project-ref>
supabase functions deploy docusign-connect --project-ref <new-project-ref>
node scripts/verify-supabase-production.mjs --env-file .env.production
```

Migration order:
1. `0001_phase_0_2_schema.sql`
2. `0002_commission_idempotency.sql`
3. `0003_atomic_funding_and_rpc_grants.sql`
4. `0004_outbox_events.sql`
5. `0005_partner_esign_envelopes.sql`
6. `0006_commission_payout_workflow.sql`

Expected output:
- Supabase preflight passes for `icc-file-desk (<new-ref>)`.
- Migrations apply without destructive reset.
- Edge secrets set without printing secret values.
- `sendgrid-events` deploys.
- `docusign-connect` deploys.
- Verification reports schema, private bucket, and cross-partner RLS passed.
- Script prints `Bootstrap mode completed without SENDGRID_EVENT_PUBLIC_KEY`.
- Record:
  - `https://<new-project-ref>.functions.supabase.co/sendgrid-events`
  - `https://<new-project-ref>.functions.supabase.co/docusign-connect`

Verify:
- Supabase dashboard shows tables: `partners`, `submissions`, `commissions`, `suppression`, `rate_limits`, `outbox_events`, `partner_esign_envelopes`, `commission_payout_audit`.
- Storage bucket `submission-files` exists and is private.
- Edge Functions page lists only `sendgrid-events` and `docusign-connect` for this app.

Abort/rollback:
- If migration fails, stop before Netlify deploy. Fix with a new migration PR.
- If an Edge Function deploy fails, rerun only the same targeted deploy command after the cause is fixed.
- Do not run `supabase db reset` or anything that references local sample data.

### 2.4 Final Supabase Secret Pass

`[AUTOMATED]`

Run this only after Phase 4.3 adds `SENDGRID_EVENT_PUBLIC_KEY` to `.env.production`.

Command:

```bash
npm run readiness:prod -- --env-file .env.production
npm run deploy:supabase -- --env-file .env.production --project-ref <new-project-ref> --project-name icc-file-desk
```

Expected output:
- Full readiness passes with no missing values.
- Supabase Edge secrets update on the dedicated project only.
- `sendgrid-events` and `docusign-connect` are redeployed to the same project ref.
- Live unsigned webhook checks return `401`.

Abort/rollback:
- If full readiness fails, do not configure provider webhooks against this project.
- Fix `.env.production` locally; never relax fail-closed webhook behavior for production.

## Phase 3: Netlify App Site Setup And Deploy

### 3.1 Create New Netlify Site

`[OPERATOR-PRESENT]`

Command option:

```bash
netlify sites:create --name icc-file-desk
```

UI option:
1. Netlify > Add new site.
2. Create a new blank/manual site named `icc-file-desk`.
3. Do not link or reuse existing Iron Crown sites.
4. It is acceptable to do this before Phase 2.2 so `.env.production` can contain real default Netlify URLs. Do not deploy yet.

Expected output:
- New site ID is created.
- Default URL looks like `https://<new-site>.netlify.app`.

Verify:
- Copy site ID/name into `.env.production`.
- Set `APP_ORIGIN=https://<new-site>.netlify.app`.
- Set `DOCUSIGN_RETURN_URL=https://<new-site>.netlify.app/#portal`.
- Set `UNSUBSCRIBE_URL=https://<new-site>.netlify.app/.netlify/functions/unsubscribe`.
- Set `CERTIFIED_EMAIL_WEBHOOK_URL=https://<new-site>.netlify.app/.netlify/functions/certified-email`.

Abort/rollback:
- If Netlify points at an existing site, stop. Do not deploy.
- Delete only the new mistaken site if no deploy/data exists.

### 3.2 Netlify Preflight And Draft Deploy

`[AUTOMATED]`

Command:

```bash
npm run deploy:netlify -- --env-file .env.production --site-id <new-site-id> --site-name icc-file-desk
```

The script runs:

```bash
netlify status --site <new-site-id>
netlify sites:list
npm run build
netlify env:import <temporary-netlify-env-file> --site <new-site-id> --context production
netlify deploy --site <new-site-id> --json
```

Expected output:
- Netlify preflight passes for `icc-file-desk (<new-site-id>)`.
- Build passes.
- Env import completes on the new site only.
- Draft deploy URL is printed.

Verify draft URL manually:
- App loads.
- Rescue Challenge renders.
- Portal/admin sign-in screens render.
- Unauthenticated `/.netlify/functions/admin-data` returns safe JSON `401`.
- No console errors on first load.

Abort/rollback:
- If preflight sees any other site, stop.
- If draft fails, do not deploy production. Fix in PR.

### 3.3 Netlify Production Deploy On Default Subdomain

`[AUTOMATED]`

Command:

```bash
npm run deploy:netlify -- --env-file .env.production --site-id <new-site-id> --site-name icc-file-desk --prod
```

Expected output:
- Draft deploy succeeds first.
- Production deploy URL is printed.
- Default `*.netlify.app` URL serves the app.

Verify:

```bash
curl -I https://<new-site>.netlify.app
curl -s https://<new-site>.netlify.app/.netlify/functions/admin-data
```

Expected:
- First command returns `200` and security headers.
- Second command returns safe JSON `401` without internals.

Abort/rollback:
- Netlify rollback: in the new site only, use Deploys > previous successful deploy > Publish deploy.
- Do not touch any other Netlify site.

## Phase 4: SendGrid Setup

### 4.1 API Key

`[OPERATOR-PRESENT]`

In SendGrid:
1. Settings > API Keys.
2. Create a new key named `icc-file-desk-transactional`.
3. Permission: Mail Send only.
4. Copy once into `.env.production` as `SENDGRID_API_KEY`.

Expected output:
- Key created and stored outside repo.

Verify:
- `npm run readiness:prod -- --env-file .env.production` still passes.

Abort/rollback:
- If key is exposed, revoke it and create a new one.

### 4.2 Domain Authentication DNS

`[OPERATOR-PRESENT]`

In SendGrid:
1. Sender Authentication > Authenticate Your Domain.
2. Domain: `partners.ironcrowncapital.com`.
3. Do not alter existing authenticated domains.
4. Copy the exact generated records.

Add only these new records in Wix DNS. Values below are slots; SendGrid generates the exact values and they must be copied exactly:

| Type | Host/name in Wix | Value/target from SendGrid | TTL |
| --- | --- | --- | --- |
| CNAME | `em...partners.ironcrowncapital.com` | `u...wl....sendgrid.net` | 1 hour |
| CNAME | `s1._domainkey.partners.ironcrowncapital.com` | `s1.domainkey.u....wl....sendgrid.net` | 1 hour |
| CNAME | `s2._domainkey.partners.ironcrowncapital.com` | `s2.domainkey.u....wl....sendgrid.net` | 1 hour |
| TXT | `_dmarc.partners.ironcrowncapital.com` | `v=DMARC1; p=none;` | 1 hour |

Expected output:
- SendGrid eventually shows domain verified.

Verify:
- SendGrid Sender Authentication status is verified.
- DNS lookup returns the new records.

Abort/rollback:
- Remove only the new `partners.ironcrowncapital.com` records if the setup is abandoned.
- Do not modify existing root, `www`, Google, or other SendGrid records.

### 4.3 SendGrid Event Webhook

`[OPERATOR-PRESENT]`

Critical ordering: Supabase Edge Functions must already be deployed so the endpoint URL exists.

Check for existing webhook first:
1. SendGrid > Settings > Mail Settings > Event Webhook.
2. If any existing webhook is present, do not overwrite it.
3. Create a separate File Desk webhook if SendGrid plan/UI allows multiple; otherwise stop for operator decision.

New File Desk webhook:
- Endpoint: `https://<new-project-ref>.functions.supabase.co/sendgrid-events`
- Events: `bounce`, `dropped`, `spamreport`
- Signed Event Webhook: enabled
- Copy public verification key to `.env.production` as `SENDGRID_EVENT_PUBLIC_KEY`
- Re-run the full Supabase secret pass:

```bash
npm run readiness:prod -- --env-file .env.production
npm run deploy:supabase -- --env-file .env.production --project-ref <new-project-ref> --project-name icc-file-desk
```

Expected output:
- Full readiness passes with no `--allow-missing`.
- Supabase Edge secrets update without printing secret values.
- SendGrid test event receives `200`.
- Missing/invalid signatures still return `401`.

Verify:
- SendGrid Event Webhook test passes.
- Supabase function logs show request accepted for signed test.

Abort/rollback:
- Disable/delete only the new File Desk webhook if needed.
- Never overwrite an unrelated webhook.

## Phase 5: DocuSign Setup

### 5.1 Production Go-Live Promotion

`[OPERATOR-PRESENT]`

Start early:
1. Create/identify dedicated DocuSign app/integration for File Desk.
2. Complete DocuSign production go-live review/promotion for that integration.
3. Do not edit the existing HTML contract drafter integration unless Juan explicitly approves.

Expected output:
- Integration key is approved for production.

Abort/rollback:
- If review is pending, deploy can continue only with e-sign disabled/stubbed for internal testing; production partner certification remains blocked.

### 5.2 JWT App, RSA Keypair, And Consent

`[OPERATOR-PRESENT]`

Steps:
1. DocuSign Admin > Apps and Keys.
2. Create or use dedicated File Desk integration.
3. Generate RSA keypair; store private key outside repo.
4. Record:
   - `DOCUSIGN_INTEGRATION_KEY`
   - `DOCUSIGN_USER_ID`
   - `DOCUSIGN_PRIVATE_KEY`
   - `DOCUSIGN_ACCOUNT_ID`
5. Grant JWT impersonation consent for the integration/user.

Expected output:
- JWT token request can succeed during smoke.

Abort/rollback:
- Revoke/delete only the File Desk RSA key if exposed.

### 5.3 ISO Template And Field Map

`[OPERATOR-PRESENT]`

Steps:
1. Create a new template dedicated to File Desk ISO partner agreement.
2. Do not modify existing contract-drafter templates.
3. Template role name must match `DOCUSIGN_TEMPLATE_ROLE_NAME`.
4. Add fields/tabs matching `DOCUSIGN_FIELD_MAP_JSON`.
5. Template must support embedded signing with `clientUserId = partner_id`.

Expected env:

```bash
DOCUSIGN_ISO_TEMPLATE_ID=<new-template-id>
DOCUSIGN_TEMPLATE_ROLE_NAME=Signer1
DOCUSIGN_FIELD_MAP_JSON={"Partner Name":"fullName","Firm":"firmName","Email":"email"}
```

Verify:
- `cert-signup` creates an envelope and returns an embedded signing URL.
- Envelope custom fields include `partner_id` and `referral_token`.

Abort/rollback:
- Void only test envelopes created by File Desk.
- Do not edit unrelated templates.

### 5.4 DocuSign Connect

`[OPERATOR-PRESENT]`

Critical ordering: Supabase Edge Functions must already be deployed.

Create a new Connect configuration:
- Endpoint: `https://<new-project-ref>.functions.supabase.co/docusign-connect`
- Event: envelope completed
- Include envelope custom fields
- Enable HMAC
- HMAC secret must match `DOCUSIGN_CONNECT_HMAC_SECRET`

Expected output:
- Connect configuration saved and active.

Verify:
- Complete a test envelope.
- Supabase partner row updates to `certified` for non-pending partner.
- Certified email enters SendGrid/outbox path.

Abort/rollback:
- Disable/delete only the new File Desk Connect config.
- Never modify the existing contract-drafter Connect config.

## Phase 6: Custom Domain And DNS

### 6.1 Attach Netlify Custom Domain

`[OPERATOR-PRESENT]`

Only after default `*.netlify.app` smoke passes:
1. Netlify new File Desk site > Domain management.
2. Add `partners.ironcrowncapital.com`.
3. Do not attach domain to any existing site.

Expected output:
- Netlify provides DNS target and SSL status.

Verify:
- Domain appears only on the new `icc-file-desk` site.

Abort/rollback:
- Remove `partners.ironcrowncapital.com` from the new site only.

### 6.2 Wix DNS For App Domain

`[OPERATOR-PRESENT]`

Add only the Netlify-required record for `partners.ironcrowncapital.com`. Do not edit existing root or `www` records.

Expected output:
- DNS propagates.
- Netlify SSL certificate issues.

Verify:

```bash
curl -I https://partners.ironcrowncapital.com
```

Expected:
- `200` or `301/302` to HTTPS with Netlify headers.

Abort/rollback:
- Remove only the new `partners` record.
- Continue using the default Netlify subdomain if SSL is not ready.

### 6.3 Update Env To Custom Domain

`[AUTOMATED]`

After SSL is issued, update `.env.production`:

```bash
APP_ORIGIN=https://partners.ironcrowncapital.com
DOCUSIGN_RETURN_URL=https://partners.ironcrowncapital.com/#portal
UNSUBSCRIBE_URL=https://partners.ironcrowncapital.com/.netlify/functions/unsubscribe
CERTIFIED_EMAIL_WEBHOOK_URL=https://partners.ironcrowncapital.com/.netlify/functions/certified-email
```

Run:

```bash
npm run readiness:prod -- --env-file .env.production
npm run deploy:netlify -- --env-file .env.production --site-id <new-site-id> --site-name icc-file-desk --prod
npm run deploy:supabase -- --env-file .env.production --project-ref <new-project-ref> --project-name icc-file-desk
```

Expected output:
- Readiness passes.
- Netlify env updates on new site only.
- Supabase Edge secrets update on new project only.

Abort/rollback:
- Revert `.env.production` URLs to default Netlify subdomain and rerun the same targeted scripts.

## Phase 7: Landing Deploy To Existing Iron Crown Site

`[OPERATOR-PRESENT]`

This is separate from the File Desk app site. It touches the existing Iron Crown marketing site only under `/file-desk/`.

Source:
- `landing/file-desk/file-desk/`

Rules:
- Deploy/copy only the nested `file-desk/` folder to the existing Iron Crown site path `/file-desk/`.
- Do not create or overwrite root files.
- Do not create or overwrite `/images/` at site root.
- All landing assets stay under `/file-desk/images/` and `/file-desk/fonts/`.
- `robots.txt` and `sitemap.xml` are landing-scoped under `/file-desk/`.

Netlify Forms:
1. Confirm the landing form is detected on the Iron Crown marketing site.
2. Enable form notifications for File Desk leads.
3. Add lead notification email for Juan/VA.
4. Confirm where leads land: Netlify Forms dashboard for that marketing site plus notification email.

Expected output:
- `https://ironcrowncapital.com/file-desk/` loads the landing page.
- Form submit redirects to `/file-desk/thankyou.html`.
- Lead appears in Netlify Forms and email notification arrives.

Abort/rollback:
- Remove only `/file-desk/` files from the marketing site deploy.
- Do not roll back unrelated Iron Crown pages.

## Phase 8: Post-Deploy Smoke And Manual Verification

### 8.1 Automated Live Smoke

`[AUTOMATED]`

Set smoke env locally, not in repo:

```bash
export LIVE_FUNCTION_BASE=https://<new-site>.netlify.app/.netlify/functions
export SUPABASE_URL=https://<new-ref>.supabase.co
export SUPABASE_ANON_KEY=<anon-key>
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
export SMOKE_ADMIN_EMAIL=<allowlisted-admin-email>
export SMOKE_ADMIN_PASSWORD=<admin-password>
export SMOKE_PARTNER_EMAIL=<non-generic-test-email-you-can-receive>
npm run smoke:live
```

Expected output:
- Unauthenticated admin check returns safe `401`.
- Admin sign-in succeeds.
- Intake creates a test submission and returns checker result.
- Admin sends to underwriting.
- Admin marks funded.
- First-funded review is cleared.
- Commission advances `accrued -> authorized -> paid`.
- Unsigned webhook requests return `401`.
- Cross-partner RLS test passes and cleans up.

Rollback trigger:
- If any smoke step fails, do not attach custom domain and do not send traffic.
- Roll back Netlify to prior deploy on the new site only.
- Fix code/config in PR or env values, then rerun smoke.

### 8.2 Manual Live Checklist

`[OPERATOR-PRESENT]`

Manual checks:
- App health: homepage loads on default Netlify URL.
- Security headers: `curl -I` shows CSP, `X-Frame-Options`, `X-Content-Type-Options`.
- Test SendGrid email reaches verified test inbox.
- SendGrid Event Webhook signed test succeeds.
- SendGrid bounce/dropped/spamreport test writes/updates `suppression`.
- DocuSign cert-signup creates embedded signing URL.
- Complete test DocuSign envelope.
- DocuSign Connect updates partner and does not duplicate on replay.
- Admin dashboard login works only for `ADMIN_EMAILS`.
- VA loop works: approve partner, queue, send to underwriting, mark funded.
- Payout loop works: clear first-funded review, authorize, mark paid.
- Outbox panel shows stuck items and retry works.
- Partner portal shows only that partner's submissions/commissions.
- Live RLS script passes.
- Landing `/file-desk/` form submission creates Netlify Forms lead and sends notification.

Rollback triggers:
- Any cross-partner read succeeds.
- Webhook verification accepts unsigned production requests.
- Admin bypass works in production.
- Demo data appears with `VITE_DEMO_MODE=false`.
- Email sends from an unauthenticated/unverified domain.
- DocuSign modifies or sends from the wrong template/integration.

## Phase 9: Day-1 Operating Handoff

`[OPERATOR]`

Read `docs/OPERATOR_GUIDE.md` before launch.

Expected:
- VA/operator knows daily queue, payout, outbox, and suppression checks.

Abort/rollback:
- If the daily owner is not assigned, delay launch.

## Final Gap Sweep

Current known remaining human-only items:
- Operator supplies secrets/keys in `.env.production`.
- Operator creates the new Supabase project and new Netlify site.
- Operator is present for SendGrid DNS/webhook, DocuSign production promotion/template/Connect, Wix DNS, Netlify custom domain/SSL, and landing deployment to the existing Iron Crown marketing site.
- Operator supplies a non-generic test partner email and an allowlisted admin login for smoke.

No additional repo work is known after this runbook, `.env.production.template`, deploy scripts, smoke script, readiness gate, and operator guide are reviewed. Confidence basis:
- Migrations are ordered `0001` through `0006`.
- Production readiness gate checks env completeness and unsafe toggles.
- Deploy scripts preflight explicit site/project targets and refuse mismatches.
- Supabase verification checks schema, private bucket, and live cross-partner RLS.
- Netlify deploy script always uses explicit `--site`.
- No production path runs local sample data.
