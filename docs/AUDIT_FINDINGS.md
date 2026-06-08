# Audit Findings

Prepared on branch `audit/adversarial-self-audit`, stacked on the full app PR series through `feature/admin-email-completeness`.

## Scope

- App audit target: ICCLeadGen app, Netlify functions, Supabase migrations/functions, local test harness, docs, and config.
- Landing audit target: PR #3 landing source from `origin/add/file-desk-landing-source`, reviewed in a separate temporary local worktree only.
- Account safety: no production deploys, no browser actions, no live Netlify/Supabase/SendGrid/DocuSign mutations, and no DNS changes were performed.
- Verification performed locally only: Vitest, production build, `npm audit --audit-level=moderate`, static landing inspection, and Lighthouse against a localhost static server.

## Blocker

No unresolved blocker was found after the High fixes below.

Production is still intentionally blocked until review approval, operator-supplied secrets, SendGrid/DocuSign setup, isolated Netlify/Supabase deployment, and DNS steps from `docs/DEPLOY_CHECKLIST.md` are completed.

## High Fixed In This Branch

### H1. Funding state and commission accrual were not atomic

Severity: High

References:

- `netlify/functions/admin-action.ts:78`
- `supabase/migrations/0003_atomic_funding_and_rpc_grants.sql:5`
- `supabase/migrations/0003_atomic_funding_and_rpc_grants.sql:28`
- `supabase/migrations/0003_atomic_funding_and_rpc_grants.sql:78`
- `supabase/migrations/0003_atomic_funding_and_rpc_grants.sql:97`
- `supabase/migrations/0003_atomic_funding_and_rpc_grants.sql:130`
- `supabase/schema.sql:3`
- `tests/commission.test.ts:71`
- `tests/schema.test.ts:31`

Risk:

`admin-action.ts` previously updated a submission to `funded` before inserting the commission row. A database or network failure between those writes could leave a funded submission with no payable commission, and concurrent admin requests could race the state transition.

Fix:

Added `public.mark_submission_funded(...)` as a locked, service-role-only `SECURITY DEFINER` RPC. The function locks the submission and partner rows, computes bps, payout, clawback, and first-funded-review state, inserts the commission, updates the submission to `funded`, and handles duplicate non-renewal attempts idempotently inside one database transaction. `admin-action.ts` now calls only this RPC for mark-funded behavior.

Verification:

`tests/schema.test.ts` checks the locked transaction and function grants. `tests/commission.test.ts` checks that the admin action uses the RPC rather than separate commission insert and submission update paths.

### H2. Suspended partners could re-enter certification through DocuSign completion

Severity: High

References:

- `netlify/functions/cert-signup.ts:59`
- `supabase/functions/docusign-connect/index.ts:73`
- `supabase/functions/docusign-connect/index.ts:78`
- `tests/security.test.ts:97`
- `tests/webhooks.test.ts:67`

Risk:

A suspended partner could request or complete an agreement flow and be promoted back to `certified`, bypassing an operator suspension.

Fix:

`cert-signup.ts` now rejects existing suspended partners with 403. The DocuSign Connect handler now ignores completed envelopes for suspended partners and returns a successful ignored response without changing status.

Verification:

`tests/security.test.ts` guards the signup rejection. `tests/webhooks.test.ts` guards the suspended webhook handling path.

### H3. XLSX validation inflated ZIP contents too broadly

Severity: High

References:

- `netlify/functions/_shared/file-validation.ts:7`
- `netlify/functions/_shared/file-validation.ts:99`
- `netlify/functions/_shared/file-validation.ts:107`
- `netlify/functions/_shared/file-validation.ts:119`
- `netlify/functions/_shared/file-validation.ts:123`
- `tests/file-validation.test.ts:71`

Risk:

The XLSX parser used `unzipSync` broadly enough that a small ZIP payload could expand into a much larger memory allocation. That made file intake more exposed to XLSX expansion abuse.

Fix:

XLSX extraction now filters to workbook metadata, shared strings, and worksheets only. It rejects files with too many ZIP entries, oversized individual XML parts, or oversized total extracted XML before processing statement text.

Verification:

`tests/file-validation.test.ts` covers too many ZIP entries, over-expanded XML parts, active-content PDFs, wrong magic bytes, unsupported content, oversized files, and accepted CSV/PDF/XLSX happy paths.

### H4. Intake upload could leave orphaned private storage objects

Severity: High

References:

- `netlify/functions/intake.ts:91`
- `netlify/functions/intake.ts:99`
- `netlify/functions/intake.ts:114`
- `netlify/functions/intake.ts:119`
- `tests/security.test.ts:111`

Risk:

If the file upload succeeded but the `submissions` insert failed, the private bucket could retain a statement file with no database row. That is a privacy and operations cleanup risk.

Fix:

The intake function now removes the just-uploaded storage object before returning the insert failure. Post-write transactional emails use a safe wrapper so SendGrid failure does not make an already-durable submission look failed to the broker.

Verification:

`tests/security.test.ts` checks that the uploaded storage object is removed before throwing the insert error.

### H5. Production rate limits trusted spoofable IP fallbacks

Severity: High

References:

- `netlify/functions/_shared/http.ts:69`
- `netlify/functions/_shared/http.ts:75`
- `tests/security.test.ts:56`

Risk:

If production ever missed Netlify's real client IP header, the app could fall back to spoofable `x-forwarded-for` or `client-ip` headers and let an attacker rotate rate-limit buckets.

Fix:

Production now trusts only `x-nf-client-connection-ip`. Spoofable fallbacks are accepted only when `NETLIFY_DEV=true`; otherwise requests fall into an `unknown` shared bucket.

Verification:

`tests/security.test.ts` covers the production header behavior.

### H6. Edge webhook errors could leak internals or mishandle invalid JSON

Severity: High

References:

- `supabase/functions/sendgrid-events/index.ts:10`
- `supabase/functions/sendgrid-events/index.ts:43`
- `supabase/functions/sendgrid-events/index.ts:56`
- `supabase/functions/sendgrid-events/index.ts:90`
- `supabase/functions/sendgrid-events/index.ts:102`
- `supabase/functions/docusign-connect/index.ts:9`
- `supabase/functions/docusign-connect/index.ts:43`
- `supabase/functions/docusign-connect/index.ts:68`
- `supabase/functions/docusign-connect/index.ts:92`
- `supabase/functions/docusign-connect/index.ts:169`
- `supabase/functions/docusign-connect/index.ts:181`
- `tests/webhooks.test.ts:56`

Risk:

Some webhook failure paths returned provider/database error detail and invalid JSON could become a generic function crash. Webhooks are exposed endpoints and should fail closed without exposing internals.

Fix:

Both Edge Functions now wrap handlers, explicitly return 400 for invalid JSON, log sanitized error metadata only, and return generic error messages for database/provider failures. DocuSign certified-email follow-up is non-blocking so a temporary Netlify webhook issue does not cause DocuSign retries for an already-processed completion.

Verification:

`tests/webhooks.test.ts` checks invalid JSON handling and sanitized error-response guards.

## Medium Left For Review Or Decision

### M1. RLS is checked by schema/source invariants, not an executable Supabase integration test

References:

- `supabase/migrations/0001_phase_0_2_schema.sql:153`
- `supabase/migrations/0001_phase_0_2_schema.sql:163`
- `supabase/migrations/0001_phase_0_2_schema.sql:167`
- `supabase/migrations/0001_phase_0_2_schema.sql:171`
- `tests/schema.test.ts:10`

Current coverage confirms the expected `auth.uid()` RLS policies exist for partners, submissions, and commissions. It does not yet run a Docker-backed Supabase local test where partner A attempts to read partner B with a real anon client and JWT.

Status:

Closed in follow-up: CI now boots Supabase local and runs `scripts/rls-cross-partner-test.mjs`, which fails if partner A can read partner B rows through an anon client plus JWT.

### M2. SendGrid and DocuSign calls do not have a durable outbox or explicit retry policy

References:

- `netlify/functions/_shared/email.ts:52`
- `netlify/functions/_shared/docusign.ts:122`
- `netlify/functions/_shared/docusign.ts:140`
- `netlify/functions/intake.ts:119`
- `netlify/functions/admin-action.ts:65`

Transactional emails after intake are safe-wrapped, and DocuSign Connect processing is sanitized. However, SendGrid SDK sends and DocuSign API calls still do not have a durable outbox, explicit timeout wrapper, or retry queue.

Status:

Accepted/deferred to Phase 2.5: current sends are safe-wrapped around durable state writes, and a durable `outbox_events` table should wait until real send volume proves the retry shape.

### M3. DocuSign Connect certified-email follow-up can be missed

References:

- `supabase/functions/docusign-connect/index.ts:97`
- `supabase/functions/docusign-connect/index.ts:145`
- `supabase/functions/docusign-connect/index.ts:152`
- `supabase/functions/docusign-connect/index.ts:161`

The DocuSign Connect handler no longer fails the webhook if the Netlify certified-email function is unavailable. That avoids duplicate provider retries, but it also means the certified email could be skipped without a durable retry.

Status:

Accepted/deferred to Phase 2.5: the new admin resend-certified-email action gives the VA a manual recovery path now; automatic retry belongs with the later durable outbox.

### M4. Landing page contrast is not perfect yet

References:

- `landing/file-desk/file-desk/index.html:39`
- `landing/file-desk/file-desk/index.html:57`
- `landing/file-desk/file-desk/file-desk.css:221`
- `landing/file-desk/file-desk/file-desk.css:235`

Local Lighthouse results for PR #3 landing:

- Performance: 95
- Accessibility: 96
- Best Practices: 100
- SEO: 100
- CLS: 0.001
- LCP: 2.7s
- TBT: 0ms

The remaining Lighthouse issue is color contrast on the primary/header CTA: cream text on forge orange is about 3.6:1, below the 4.5:1 target. The hover orange is lower. Oxblood or a darker forge shade would pass.

Fix:

Fix the CTA contrast before deploying the landing page live, even though the overall page performance and SEO are strong.

### M5. Landing static security headers are not self-contained in PR #3

References:

- `netlify.toml:15`
- `landing/file-desk/file-desk/index.html:12`

The app has Netlify security headers in `netlify.toml`. The isolated landing folder itself does not include a landing-specific `_headers` file, so if it is copied into an existing Iron Crown deploy, headers depend on that host's existing config.

Fix:

Add or confirm host-level headers for `/file-desk/*` before publishing the landing page.

### M6. Payout authorization states exist but do not yet have a full payout workflow

References:

- `supabase/migrations/0001_phase_0_2_schema.sql:51`
- `netlify/functions/admin-data.ts:73`
- `src/App.tsx:615`
- `src/lib/admin-demo.ts:46`

The schema supports accrued/authorized/paid payout states and first-funded manual review flagging, but the current admin loop focuses on accrual visibility, not payout authorization and paid marking.

Status:

Accepted/deferred to Phase 2.5: payout authorization stays manual until the first real funded files prove the ops cadence and audit trail requirements.

## Low Left For Review Or Decision

### L1. Landing form friction may be higher than necessary

References:

- `landing/file-desk/file-desk/index.html:299`
- `landing/file-desk/file-desk/index.html:305`
- `landing/file-desk/file-desk/index.html:317`
- `landing/file-desk/file-desk/index.html:328`
- `landing/file-desk/file-desk/index.html:338`

The landing form requires full name, work email, firm, partner type, monthly volume, and file upload. That is acceptable for broker quality, but it may reduce first-submit conversion.

Fix:

A/B test making monthly volume optional after initial launch.

### L2. Existing provisional/certified partners can request another DocuSign envelope

References:

- `netlify/functions/cert-signup.ts:63`
- `netlify/functions/cert-signup.ts:67`
- `netlify/functions/cert-signup.ts:75`
- `netlify/functions/_shared/docusign.ts:42`

Suspended partners are blocked now. Existing non-suspended partners can still initiate another agreement envelope, which could create envelope noise but is not a security bypass.

Status:

Accepted/deferred to Phase 3: extra envelope creation is low-risk at launch, and volume/noise should be measured before adding reuse complexity.

### L3. Portal rank uses service-role aggregate data server-side

References:

- `netlify/functions/portal-data.ts:14`
- `netlify/functions/portal-data.ts:41`
- `netlify/functions/portal-data.ts:45`
- `netlify/functions/portal-data.ts:47`

The portal rank endpoint computes rank server-side by reading all commissions with the service role and returns only the current partner's rank and total. It does not expose other partners' raw commission rows, but it is a business side-channel by design.

Status:

Accepted/deferred to Phase 3: private rank remains a non-public motivational signal for now; public leaderboard mechanics remain out of scope until Phase 3.

## Test Coverage Summary

Instrumentation note: the repo currently uses Vitest scenario/invariant tests, not line-coverage instrumentation. I did not add a coverage provider in this audit PR.

Current test suite coverage:

- Rules-only checker: all three outcomes and no hard reject.
- Commission math: new vs renewal bps, cent rounding, and clawback threshold.
- Funded idempotency: duplicate non-renewal blocked, renewals repeatable, and admin action routed through the atomic RPC.
- File validation: CSV/PDF/XLSX accepts; oversized files, active-content PDFs, wrong magic bytes, unsupported content, and XLSX expansion abuse reject.
- Abuse throttles: Supabase-backed rate-limit policy shape, consumed-limit 429s, one-submission-until-certified, and three-per-day cap.
- Partner status routing: generic email to `pending_manual_vetting`, corporate email to `provisional`.
- Webhook verification: DocuSign HMAC and SendGrid signature valid/tampered/missing fail-closed cases.
- Security invariants: sanitized error responses, CORS locked to configured origin, production IP header trust, Zod body validation coverage, CSP/security headers, upload cleanup, and List-Unsubscribe one-click endpoint.
- Admin loop: demo approve, underwriting queue visibility, mark-funded, first-funded manual-review flag, and server-side admin allowlist guard.
- Email rendering: branded transactional shell, status emails, and certified badge.

## Readiness Statement

Ready for code review. Not ready for production deployment until the PR stack is reviewed/merged, the medium decisions above are accepted or resolved, and the operator-supplied live values and isolated deployment steps in `docs/DEPLOY_CHECKLIST.md` are completed.
