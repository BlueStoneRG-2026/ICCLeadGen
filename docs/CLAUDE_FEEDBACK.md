# Claude Review Notes

This repo is the Phase 0-2 local deployable build for ICC Amazon File Desk. It is intentionally scoped to first certified partner + first routed file + first commission event. Phase 3 sourcing/outbound/viral-loop work is deliberately deferred until a real funded deal passes through Phase 2.

## What Codex Built

- Premium React/Vite frontend for Rescue Challenge, certification, partner portal, admin queue, and starter Amazon niche pages.
- Netlify Functions for certification signup, intake, checker, portal data, admin data/actions, certified email, and unsubscribe.
- Supabase migration with the corrected `pending_manual_vetting` partner state, RLS, four application tables, and private submission storage.
- Supabase Edge Functions for DocuSeal signed webhooks and SES suppression events.
- Docker Compose VPS stack for n8n, DocuSeal, Caddy, and Watchtower.
- Deployment docs, Phase gates, and E2E test script.

## Verification Done

- `npm run build` passes.
- `npm audit --audit-level=moderate` reports zero vulnerabilities.
- Desktop and mobile browser checks were performed against the local app.
- Certification demo flow reaches DocuSeal-stub state and referral token.

## Things To Review Closely

1. Admin access model: current implementation uses `ADMIN_EMAILS` as the allowlist source to preserve the four-table constraint. If you prefer a real `app_admins` database object, decide whether that is a fifth table, a view, or auth metadata.
2. Portal/admin auth UI: backend functions expect Supabase bearer tokens in live mode, but the frontend currently uses demo data unless `VITE_DEMO_MODE=false`. A production pass should add Supabase sign-in screens and session handling.
3. DocuSeal webhook shape: the handler supports common payload fields and idempotency, but it should be tested against Juan's actual self-hosted DocuSeal event payload after the ISO template is uploaded.
4. Underwriting handoff: Phase 0-2 sends the package to `UNDERWRITING_INTAKE_EMAIL`. The code is structured so a webhook can be added later, but that destination still needs Juan's real intake path.
5. XLSX validation: I removed the vulnerable `xlsx` package and replaced it with lightweight OpenXML ZIP inspection. This is safer for intake validation, but if richer statement parsing is needed later, use a maintained parser with a clean audit.
6. Email templates: transactional emails are functional and suppression-aware, but branded HTML templates could be made more polished before live partner traffic.
7. Rate limits: in-memory rate limiting is fine for local/dev and a single warm function instance, but production should move rate limits to Supabase, Upstash, or another shared low-cost store if abuse appears.

## Suggested Next Improvements

- Add live Supabase Auth UI for partner portal and admin dashboard.
- Add a small admin action audit trail without violating the Phase 0-2 four-table rule, or explicitly approve a fifth table if accountability matters more than the constraint.
- Add integration tests for commission math, generic-email vetting, upload caps, and webhook idempotency.
- Add a branded email partial/template system so status emails match the polish of the frontend.
- After deployment, run the full `docs/TEST_SCRIPT.md` with a real DocuSeal template and SES sandbox/production identity.

## Guardrails To Keep

- Do not add Phase 3 features yet.
- Do not introduce MCA/funding-industry platform dependencies.
- Do not build underwriting, deal scoring, UCC notices, enforcement, or settlement.
- Keep the checker rules-only and never hard-reject files.
- Keep transactional mail and cold outbound domains separate.
