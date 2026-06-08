# Deploy Runbook

Run this only after all review PRs are approved and merged. This file is a script for the later deployment session; it does not execute anything by itself.

## 1. Repo Preflight

1. Confirm the final approved branch is merged to `main`.
2. Pull `origin/main`.
3. Run:

```bash
npm run build
npm test
npm audit --audit-level=moderate
```

4. Confirm no deploy ZIP is being used as source of truth.

## 2. Supabase Preflight

1. In Supabase, create a brand-new project named `icc-file-desk`.
2. Record the project ref.
3. Run a non-mutating project list and verify the new ref/name.
4. If the target is not the new dedicated project, stop.

## 3. Supabase Deploy

Use `--project-ref <new-project-ref>` on every command.

1. Apply migrations.
2. Confirm these exist:
   - `partners`
   - `submissions`
   - `commissions`
   - `suppression`
   - `rate_limits`
   - private `submission-files` bucket
   - referral-token immutability trigger
   - non-renewal commission idempotency index
3. Set Edge Function secrets from `docs/DEPLOY_CHECKLIST.md`.
4. Deploy only:
   - `sendgrid-events`
   - `docusign-connect`

## 4. Netlify Preflight

1. Create a brand-new Netlify site named `icc-file-desk`.
2. Record the site ID.
3. Run a non-mutating status/list check and verify the new site ID/name.
4. If the target is not the new dedicated site, stop.

## 5. Netlify Env and Draft Deploy

Use `--site <new-site-id>` on every command.

1. Set all Netlify env values from `docs/DEPLOY_CHECKLIST.md`.
2. Keep `VITE_DEMO_MODE=false`.
3. Deploy a draft/preview first.
4. Verify:
   - Landing app loads.
   - Rescue Challenge renders.
   - Portal/admin sign-in screen renders.
   - Functions respond with safe JSON errors when unauthenticated.
   - No browser console errors on first load.

## 6. Production Deploy

Only after the draft passes:

1. Deploy production to the default `*.netlify.app` domain.
2. Do not attach `partners.ironcrowncapital.com` yet.
3. Record production URL and site ID.

## 7. SendGrid

1. Confirm whether an Event Webhook already exists.
2. If one exists, stop and do not overwrite it.
3. If none exists, create the File Desk webhook and copy the signed-event public key.
4. Confirm domain authentication for `partners.ironcrowncapital.com`.
5. Do not touch unrelated authenticated domains.

## 8. DocuSign

1. Create a dedicated ISO partner template.
2. Confirm `DOCUSIGN_FIELD_MAP_JSON`.
3. Create a dedicated Connect config for File Desk only.
4. Confirm the Connect payload includes custom fields.
5. Do not touch the existing contract-drafter project.

## 9. Final Test

Run `docs/TEST_SCRIPT.md` against the default Netlify domain first. Custom domain and DNS cutover happen only after the default-domain test passes.
