# 06 — Automation Workflows (n8n)

## Phase 0–2 workflows (build now)
**W1 — Certification + e-sign**
- Trigger: `cert-signup` (Netlify) creates Supabase Auth user + provisional/pending `partners` row (referral_token generated).
- Step: call DocuSign API to create an envelope from the operator's ISO partner agreement template → return signing URL or remote signing notice.

**W2 — DocuSign completed (idempotent)** — implement as a **Supabase Edge Function**, not n8n (reliability):
- Receive DocuSign Connect webhook → HMAC verify → look up partner from envelope custom fields; if already `certified` with the same `esign_envelope_id`, return 200 and stop.
- Else set `esign_envelope_id`, promote non-pending partners to `certified` → send badge + cheat sheet + portal link email (via SendGrid).

**W3 — Rescue Challenge intake + checker**
- Trigger: `intake` (Netlify) after file validation → store file to Supabase Storage → create `submissions` row (`routing_state='received'`).
- Step: `checker` rules → set `checker_decision`; route `likely_fundable`/`needs_review` → `routing_state='va_check'` and notify VA; `out_of_box` → friendly reason email. Never hard-reject.

**W4 — Status updates (the second-file engine)**
- Trigger: any `submissions.routing_state` change.
- Step: send the partner the matching status email: received → under_review → (missing_docs) → underwriting → approved/declined → funded.

**W5 — Funding → commission**
- Trigger: operator sets `routing_state='funded'` (portal button).
- Step: `clawback_eligible = funded_amount > 10000`; `payout_owed = funded_amount * (is_renewal ? bps_renewal : bps_new)/10000`; insert `commissions` (`payout_state='accrued'`); for a partner's FIRST funded deal, flag for manual partner review before authorizing payout; notify partner + portal.

**W6 — Health check**
- Phase 3 only. Cron (5–30 min) hits n8n `/healthz`; alert operator/VA on failure. (No external dependency required.)

**SendGrid bounce/drop/spam/unsubscribe** — **Supabase Edge Function** (sync) inserts into `suppression`. Outbound checks `suppression` before sending.

## Phase 3+ workflows (deferred — do NOT build yet)
Sourcing/enrichment (VA seed list + website enrichment), segmented outbound email (Tier B/C) with low-volume sending, the 3-ask viral loop, boards + monthly File Notes, automated partner-quality scoring, source-decay engine.
