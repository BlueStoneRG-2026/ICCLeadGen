# 07 — Frontend (Netlify pages + serverless functions)

## Pages (Phase 0–2)
- **Rescue Challenge** (front door): *"Have an Amazon deal nobody could place? Upload it."* — file upload + minimal fields.
- **Certification funnel:** landing → short static training → short quiz (ceremonial, not a gate) → signup.
- **Partner portal** (Supabase Auth + RLS): submissions list + status, commission ledger (incl. renewals), private rank, referral link, badge/cheat-sheet download.
- **SEO/content pages** (basic): "funding for Amazon sellers / Relay carriers / DSP operators."

## Serverless functions (Phase 0–2)
- `cert-signup.ts` — create Supabase Auth user + provisional `partners` row → trigger W1 (DocuSeal envelope) → return signing URL. Rate-limit by IP (1/hr) + email domain (1/day).
- `intake.ts` — **validate file by MIME + content** (csv/pdf/xlsx; ≤15 MB; CSV header check / PDF script scan), store to Storage, create `submissions` row → trigger W3. Enforce provisional cap (1 submission until certified; ≤3 uploads/day for new partners).
- `checker.ts` — rules-only logo-match (Amazon/Relay/DSP descriptor + dominance) → `likely_fundable` / `needs_review` / `out_of_box`.
- `portal-data.ts` — RLS-scoped read of the partner's submissions/commissions/rank/referral link.
- Webhooks: `docuseal-webhook` and `ses-events` are **Supabase Edge Functions** (see workflows), not Netlify, for reliability.

## Notes
- Email sends include the **List-Unsubscribe** header (RFC 8058).
- No `localStorage`/`sessionStorage` assumptions; portal state via Supabase Auth session.
