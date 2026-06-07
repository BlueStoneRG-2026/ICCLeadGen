# 08 — Integrations & Environment

## Services
- **Supabase** — Postgres + Storage + Auth + RLS + Edge Functions (DocuSeal webhook, SES events).
- **Netlify** — site + serverless functions.
- **Amazon SES** — outbound from owned domains. SPF/DKIM/DMARC; DMARC progression **p=none (wk 1–2) → quarantine (wk 3–4) → reject (wk 5+)**; List-Unsubscribe header; suppression enforced before send. At low volume (<500/wk) skip elaborate warm-up — send modestly and let reputation build.
- **DocuSeal** — self-hosted Docker; template = operator's ISO partner agreement.
- **n8n** — self-hosted Docker; use its credential store (never put secrets in workflow JSON exports).
- **Google Places** (Phase 3, optional, cost-capped) — use strict field masking / minimal SKU, or prefer OpenStreetMap / public datasets. Places returns NO email; do not rely on it for discovery.

## Environment variables
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SES_REGION=
SES_ACCESS_KEY=
SES_SECRET=
SENDING_DOMAINS=            # comma-separated owned domains
DOCUSEAL_URL=
DOCUSEAL_API_TOKEN=
DOCUSEAL_WEBHOOK_SECRET=
N8N_WEBHOOK_BASE=
N8N_BASIC_AUTH_USER=
N8N_BASIC_AUTH_PASSWORD=
# Phase 3 (optional):
GOOGLE_PLACES_KEY=
```

## Cost target
VPS ~$6–12/mo (Hetzner) · Supabase/Netlify free tiers · SES ~$1–10/mo · DocuSeal/n8n self-hosted free. **~$6–22/mo software + VA wages.** Watch Supabase free 500MB DB; upgrade to Pro ($25/mo) before the limit if needed.
