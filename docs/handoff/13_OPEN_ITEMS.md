# 13 — Open Items (operator provides at build time)

There are **no open design decisions.** The operator supplies two assets during the build:

1. **The ISO partner agreement template** — the operator's existing agreement, loaded into DocuSign as the e-sign template (Phase 1). Builder maps the signature/field positions; no drafting.
2. **DNS access for the sending domains** — to set SendGrid domain authentication and DMARC (Phase 0).

Confirmed by the operator (no action needed):
- Commission 10–12% of funded; **renewals paid at full rate**.
- **No clawbacks on deals ≤ $10,000** (deals > $10k follow the ISO agreement terms; `clawback_eligible` flag handles this).
- Merchant agreements, underwriting, UCC notices, enforcement — all operator-owned, out of scope.
- Defaults accepted: Supabase Auth = partner identity; Tier A = VA phone/LinkedIn; Netlify/Supabase Phase 0–2; SendGrid; DocuSign. VPS/n8n/DocuSeal deferred to Phase 3.
