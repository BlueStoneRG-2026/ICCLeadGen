# 04 — Architecture

```
   PUBLIC DATA (Google Maps/Places*, broker sites, public search, YouTube)   *minimal/optional; cost-capped
                         │  (Phase 3: VA seed list + n8n enrichment — NOT auto email-scraping)
                         ▼
            Supabase  (Postgres + Storage + Auth + RLS)
                  ▲                         ▲
                  │ serverless functions    │ portal auth/data (RLS)
            Netlify  (pages + functions)
            Certification · Rescue Challenge · checker · portal · SEO
                  ▲
                  │ email out (owned domains) / DocuSign Connect / SendGrid events (Edge Functions)
                  ▼
            SendGrid (owned transactional domain)  →  partners
                  ▲
                  │ ISO template envelope + Connect webhook
                  ▼
            DocuSign (operator-owned e-sign account)
                  │
   qualified file routes to →  OPERATOR'S EXISTING UNDERWRITING / UCC / FUNDING SYSTEM
```

## Stack
- **Supabase** — Postgres, Storage (uploads), Auth (portal), RLS.
- **Netlify** — static pages + serverless functions.
- **SendGrid** — outbound transactional email from the owned domain.
- **DocuSign** — e-sign of the operator's ISO agreement from an existing account.
- **Phase 3 deferred:** n8n, VPS, Watchtower, and DocuSeal fallback.

## Independence principle
Supabase, Netlify, SendGrid, and DocuSign are commodity/operator-owned services, portable, and not run by industry competitors. **No industry platform anywhere** — not as a channel and not as a data source. VPS/n8n/DocuSeal is deferred to Phase 3.
