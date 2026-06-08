# ICC Amazon File Desk

Phase 0-2 local deployable build for Iron Crown Capital's Amazon File Desk.

## What is included

- Vite + React frontend for Rescue Challenge, certification, partner portal, admin dashboard, and starter niche pages.
- Netlify Functions for certification signup, Rescue Challenge intake, rules-only checker, partner portal data, admin actions, certified email, and unsubscribe suppression.
- Supabase migration for the Phase 0-2 model with RLS, the corrected `pending_manual_vetting` partner state, shared rate limits, and immutable referral tokens.
- Supabase Edge Functions for DocuSign Connect webhooks and SendGrid bounce/drop/spam suppression events.
- Phase 3-only Docker Compose stack for n8n/Caddy/Watchtower plus DocuSeal as a future free e-sign fallback. It is not part of the Phase 0-2 runtime.
- Handoff kit copied into `docs/handoff`.
- Claude-facing review notes in `docs/CLAUDE_FEEDBACK.md`.

Phase 3 sourcing, outbound, boards, public leaderboard, viral loop, and partner scoring are intentionally deferred.

## Local Review

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs in demo mode until `VITE_DEMO_MODE=false` and live Supabase/Netlify values are supplied. In live mode, the partner portal and admin dashboard use Supabase Auth sessions and send bearer tokens to the backend functions.

For Netlify Functions locally:

```bash
npm install -g netlify-cli
netlify dev
```

For a full local Supabase + mocked SendGrid/DocuSign flow, use [docs/LOCAL_RUNTIME.md](docs/LOCAL_RUNTIME.md). It includes seed data, teardown, and `npm run local:flow`.

## Review And Deploy Docs

- [docs/DEPLOY_CHECKLIST.md](docs/DEPLOY_CHECKLIST.md) is the single source of truth for operator-supplied values, DNS, isolated Supabase/Netlify setup, SendGrid, and DocuSign.
- [docs/DEPLOY_RUNBOOK.md](docs/DEPLOY_RUNBOOK.md) is the ordered final deploy script to follow after review approval.
- [docs/TEST_SCRIPT.md](docs/TEST_SCRIPT.md) is the post-deploy validation path.
- GitHub is the source of truth. Do not deploy loose ZIPs.

## Deploy-Time Values Juan Supplies

- ISO partner agreement as a DocuSign template plus field map.
- `SENDING_DOMAIN` plus SendGrid DNS authentication and DMARC access.
- `UNDERWRITING_INTAKE_EMAIL`.
- `ADMIN_EMAILS` allowlist for operator and VA accounts.

## Core defaults

- Transactional sending domain defaults to `partners.ironcrowncapital.com`.
- Commission defaults to 11% new and renewal, adjustable per partner within 10-12%.
- Generic email signups start at `pending_manual_vetting` and cannot submit files until VA approval.
- Corporate email signups start at `provisional`.
- Provisional partners get 1 submission until certified and 3 uploads/day.
- No deal scoring, no underwriting, no industry-platform dependency.

## Official infra references

- SendGrid Event Webhook security: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
- SendGrid List-Unsubscribe: https://www.twilio.com/docs/sendgrid/ui/sending-email/list-unsubscribe
- DocuSign JWT auth: https://developers.docusign.com/platform/auth/jwt-get-token/
- DocuSign template envelopes: https://developers.docusign.com/docs/esign-rest-api/how-to/request-signature-template-remote/
- DocuSign Connect HMAC: https://www.docusign.com/blog/developers/manually-authenticating-hmac-signatures-docusign-connect-webhook-configurations
- Phase 3 n8n Docker docs: https://docs.n8n.io/hosting/installation/docker/
