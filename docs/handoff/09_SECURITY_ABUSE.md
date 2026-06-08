# 09 — Security & Abuse Control

## File upload validation (intake.ts)
- Validate by **MIME type from the buffer**, not the extension.
- Allow only: text/csv, application/pdf, xlsx. Reject > 15 MB.
- CSV: parse first rows, validate expected bank-statement-style headers. PDF: scan for embedded scripts. Reject on parse failure / unexpected structure.

## Provisional-partner abuse throttles
- Rate-limit `cert-signup` by IP (1/hr) and email domain (1/day).
- **Corporate email auto-promotes; generic (gmail/yahoo/outlook) → `pending_manual_vetting`** (VA approves before any submission is accepted).
- Provisional cap: **1 submission until certified**; **≤3 uploads/day** for new partners.
- Lock on patterns: same IP / same merchant / repeated failed files.
- **No public badge/profile until approved.** **First funded deal → manual partner review before payout authorized.**

## Partner quality tier
`green` (auto-trust) / `yellow` (VA review) / `red` (blocked). Set manually/VA in Phase 0–2; automate scoring in Phase 3+ from submission behavior (valid files, funded files, junk, complaints, duplicates) — this is **partner** scoring, never deal/underwriting scoring.

## Data security
- **RLS** so a partner sees only their own rows (`auth.uid() = partners.id`).
- Webhooks verify signing secrets (DocuSign Connect HMAC, SendGrid signed Event Webhook).
- Idempotency on the DocuSign webhook (`esign_envelope_id`).
- Phase 0-2 secrets live only in Netlify environment variables and Supabase Edge Function secrets, never in exports or committed files. n8n credential storage is Phase 3-only.
