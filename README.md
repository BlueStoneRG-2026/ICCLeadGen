# ICC Amazon File Desk

Phase 0-2 local deployable build for Iron Crown Capital's Amazon File Desk.

## What is included

- Vite + React frontend for Rescue Challenge, certification, partner portal, admin dashboard, and starter niche pages.
- Netlify Functions for certification signup, Rescue Challenge intake, rules-only checker, partner portal data, admin actions, certified email, and unsubscribe suppression.
- Supabase migration for the four-table Phase 0-2 model with RLS and the corrected `pending_manual_vetting` partner state.
- Supabase Edge Functions for DocuSeal signed webhooks and SES bounce/complaint/unsubscribe events.
- Docker Compose VPS stack for n8n, DocuSeal, Caddy, and Watchtower.
- Handoff kit copied into `docs/handoff`.
- Claude-facing review notes in `docs/CLAUDE_FEEDBACK.md`.

Phase 3 sourcing, outbound, boards, public leaderboard, viral loop, and partner scoring are intentionally deferred.

## Local review

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs in demo mode until `VITE_DEMO_MODE=false` and live Supabase/Netlify values are supplied.

For Netlify Functions locally:

```bash
npm install -g netlify-cli
netlify dev
```

## Deploy-time values Juan supplies

- ISO partner agreement PDF and DocuSeal field map.
- `SENDING_DOMAIN` plus SPF/DKIM/DMARC DNS access.
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

- n8n Docker docs: https://docs.n8n.io/hosting/installation/docker/
- DocuSeal Docker image/docs: https://hub.docker.com/r/docuseal/docuseal and https://www.docuseal.com/docs/configuring-docuseal-via-environment-variables
- Watchtower usage: https://containrrr.dev/watchtower/usage-overview/
