# 08 — Integrations & Environment

## Services
- **Supabase** — Postgres + Storage + Auth + RLS + Edge Functions (DocuSign Connect webhook, SendGrid events).
- **Netlify** — site + serverless functions.
- **SendGrid** — Phase 0–2 transactional mail from the owned domain. SPF/DKIM/domain authentication via SendGrid, DMARC progression **p=none (wk 1–2) → quarantine (wk 3–4) → reject (wk 5+)** after monitoring. Sends include `List-Unsubscribe` and suppression is enforced before send.
- **DocuSign** — Phase 0–2 e-sign from Juan's existing DocuSign account. ISO partner agreement is a DocuSign template with a configurable role name and field map.
- **n8n / VPS / DocuSeal** — deferred to Phase 3. DocuSeal remains a possible free fallback if DocuSign cost becomes an issue; do not stand it up for Phase 0–2.
- **Google Places** (Phase 3, optional, cost-capped) — use strict field masking / minimal SKU, or prefer OpenStreetMap / public datasets. Places returns NO email; do not rely on it for discovery.

## Environment variables
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SENDGRID_API_KEY=
SENDGRID_EVENT_PUBLIC_KEY=
SENDING_DOMAIN=partners.ironcrowncapital.com
TRANSACTIONAL_FROM=Iron Crown File Desk <desk@partners.ironcrowncapital.com>
REPLY_TO_EMAIL=desk@partners.ironcrowncapital.com
UNSUBSCRIBE_URL=
DOCUSIGN_AUTH_SERVER=account-d.docusign.com
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_USER_ID=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_ISO_TEMPLATE_ID=
DOCUSIGN_TEMPLATE_ROLE_NAME=Signer1
DOCUSIGN_SIGNING_MODE=embedded
DOCUSIGN_RETURN_URL=
DOCUSIGN_FIELD_MAP_JSON={}
DOCUSIGN_CONNECT_HMAC_SECRET=
CERTIFIED_EMAIL_WEBHOOK_URL=
INTERNAL_WEBHOOK_SECRET=
UNDERWRITING_INTAKE_EMAIL=
ADMIN_EMAILS=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DEMO_MODE=false
# Phase 3 (optional):
GOOGLE_PLACES_KEY=
```

## Cost target
Phase 0–2 software stays near-free because Juan already owns SendGrid and DocuSign. Supabase/Netlify should stay on free tiers at launch. VPS/n8n/DocuSeal spend is deferred to Phase 3.
