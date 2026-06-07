# Claude Review Response — ICC Amazon File Desk (Phase 0–2)

Reviewed against the locked spec by cloning the repo at commit `334250e "Initial Phase 0-2 File Desk build"`. **Verdict: green light.** The build is faithful and high quality. This document records the decisions Codex should apply next; it supersedes the Netlify/SES references in the original handoff kit.

---

## 1. Confirmed correct — keep as built
- **Four-table schema** (`partners`, `submissions`, `commissions`, `suppression`), RLS on all four, self-access SELECT policies, private 15 MB `submission-files` bucket with a MIME allowlist.
- **`pending_manual_vetting`** is in the status enum; generic emails start there, corporate emails start `provisional`.
- **Split commission** (`commission_bps_new` / `commission_bps_renewal`), both default 1100, clamped 1000–1200; `pays_on_renewals` TRUE; clawback flagged only when `funded_amount > 10000`.
- **`ON DELETE RESTRICT`** throughout; **`esign_envelope_id` UNIQUE** for webhook idempotency; indexes present.
- **Rules-only checker** — regex descriptor match (Amazon / Relay / DSP), three outcomes (`likely_fundable` / `needs_review` / `out_of_box`), and it **never hard-rejects**. No scoring, no oracle, no underwriting. Correct.
- **Design system** is on-brand and conversion-built (oxblood/maroon + forge accent + cream; Cormorant / DM Sans / DM Mono; hero + trust-row; ceremonial cert progress bar; screenshottable badge; mono commission ledger; real mobile breakpoints).
- **Security:** the vulnerable `xlsx` npm package was removed and replaced with OpenXML ZIP inspection. **Keep this.**

## 2. Stack decisions — LOCKED (apply these)
- **Host: stay on Netlify.** No migration to Vercel. The build is correct as-is.
- **Email: switch SES → SendGrid.** Juan already owns SendGrid; this avoids the AWS SES sandbox production-access gate and costs nothing new.
  - In `netlify/functions/_shared/email.ts`, replace the SES send path with SendGrid (`@sendgrid/mail`).
  - Replace `SES_REGION` / `SES_ACCESS_KEY` / `SES_SECRET` env vars with `SENDGRID_API_KEY`. Keep `SENDING_DOMAIN`, `TRANSACTIONAL_FROM`, `REPLY_TO_EMAIL`, `UNSUBSCRIBE_URL`, and the `List-Unsubscribe` header behavior.
  - Repurpose the `supabase/functions/ses-events` edge function as a **SendGrid Event Webhook** handler (rename to `sendgrid-events`); on `bounce` / `dropped` / `spamreport` it still writes to the `suppression` table. Verify the SendGrid signed-event signature.
- **E-sign: use existing DocuSign for Phase 0–2 instead of self-hosted DocuSeal.** Juan already runs DocuSign (Ops Hub, MCA contract generator), so this needs no VPS.
  - Rewire `netlify/functions/_shared/docuseal.ts` to the **DocuSign eSignature REST API**: create an envelope from a template for the ISO partner agreement.
  - Replace the `supabase/functions/docuseal-webhook` with a **DocuSign Connect** webhook handler; on envelope `completed`, set the partner's `esign_envelope_id` and advance state. Keep idempotency keyed on `esign_envelope_id` (HMAC-verify the Connect payload).
  - Env: remove `DOCUSEAL_*`; add `DOCUSIGN_*` (integration/JWT auth, account id, ISO template id, Connect HMAC secret, field map JSON).
  - *Reversible:* DocuSeal self-host remains the free fallback if DocuSign per-envelope cost ever matters at scale. Keep the integration boundary clean so it can be swapped back.
- **VPS / n8n / DocuSeal: DEFERRED.** Not needed for Phase 0–2. The Netlify functions + Supabase already run the full first-partner → first-file → first-commission path. n8n is Phase 3 sourcing automation. Do not stand up the VPS yet. Net new spend for Phase 0–2: **~$0.**

## 3. Gating work — required before any live partner traffic
1. **Real Supabase Auth sign-in** for the partner portal and admin dashboard. Today the frontend uses demo data unless `VITE_DEMO_MODE=false`; add sign-in screens and session handling so the backend bearer-token paths actually work in production.
2. **Move rate limiting to a shared store.** In-memory limits don't hold across serverless instances/cold starts, so the current caps are effectively unenforced under load. Back them with Supabase (a small `rate_limits` mechanism) — keep it cheap, no new vendor.
3. **Brand the status emails** to match the frontend polish (oxblood/forge/cream, Cormorant/DM Sans, badge). These status emails are the second-file engine; they must not look plain.

## 4. Small fix
- Make `referral_token` **immutable**: add a `BEFORE UPDATE` trigger on `partners` that rejects any change to `referral_token`. (Currently UNIQUE + NOT NULL but updatable.)

## 5. Operator-supplied at deploy (Juan)
- ISO partner agreement → as a **DocuSign template** + field map.
- `SENDING_DOMAIN` = `partners.ironcrowncapital.com` + SPF/DKIM/DMARC DNS records (via Wix) configured for **SendGrid**.
- `UNDERWRITING_INTAKE_EMAIL` (the package routes here in Phase 0–2; webhook path can be added later).
- `ADMIN_EMAILS` allowlist (operator + VA).

## 6. Deferred but planned
- A fifth `app_admins` table plus a small **admin action audit trail**. The email allowlist is right for now; revisit once a VA is actually clicking "funded," because that is money moving and accountability will matter. Treat as Phase 2.5, explicitly approved when added.

## 7. Guardrails to keep (unchanged)
- No Phase 3 features yet (sourcing, outbound, boards, public leaderboard, viral loop, partner scoring).
- No MCA/funding-industry platform dependencies.
- No underwriting, deal scoring, UCC notices, enforcement, or settlement — the engine only routes a qualified file into Juan's existing system.
- Checker stays rules-only and never hard-rejects.
- Keep transactional and (future) cold-outbound sending domains separate.

---

**Build order suggestion:** (2) SendGrid + DocuSign swaps → (1) Supabase Auth UI → rate-limit move → branded emails → `referral_token` trigger. Then run `docs/TEST_SCRIPT.md` end-to-end with the real DocuSign template before inviting any partner.
