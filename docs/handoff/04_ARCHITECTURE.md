# 04 — Architecture

```
   PUBLIC DATA (Google Maps/Places*, broker sites, public search, YouTube)   *minimal/optional; cost-capped
                         │  (Phase 3: VA seed list + n8n enrichment — NOT auto email-scraping)
                         ▼
   ┌──────────────  OPERATOR'S OWN VPS (Docker)  ──────────────┐
   │   n8n (orchestration)        DocuSeal (e-sign, self-host)  │
   └──────────────┬────────────────────────────────────────────┘
                  │ reads/writes (service role)
                  ▼
            Supabase  (Postgres + Storage + Auth + RLS)
                  ▲                         ▲
                  │ serverless functions    │ portal auth/data (RLS)
            Netlify  (pages + functions)
            Certification · Rescue Challenge · checker · portal · SEO
                  ▲
                  │ email out (owned domains) / DocuSeal webhook / SES bounce+complaint (Edge Function)
                  ▼
            Amazon SES (owned, warmed domains)  →  partners
                  │
   qualified file routes to →  OPERATOR'S EXISTING UNDERWRITING / UCC / FUNDING SYSTEM
```

## Stack
- **n8n** (self-hosted Docker) — orchestration.
- **DocuSeal** (self-hosted Docker) — e-sign of the operator's ISO agreement.
- **Supabase** — Postgres, Storage (uploads), Auth (portal), RLS.
- **Netlify** — static pages + serverless functions.
- **Amazon SES** — outbound from owned domains (swappable provider).
- **Watchtower** — container auto-updates. Health: n8n `/healthz` hit by a cron workflow (no external dependency required).

## Independence principle
Self-host n8n + DocuSeal on the operator's VPS. Supabase/Netlify/SES are commodity, switchable, portable, and not run by industry competitors. **No industry platform anywhere** — not as a channel and not as a data source.
