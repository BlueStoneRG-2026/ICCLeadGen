# 11 — Project Manager Runbook
**You (PM) drive the builder chat with the prompts below, one milestone at a time. Verify each "done when" gate before advancing. Do not let the builder jump ahead to Phase 3+.**

## How to run it
1. Paste this whole kit (or its key files) into the builder once for context.
2. Issue prompts in order. After each, check the acceptance gate in `10_BUILD_PHASES.md`.
3. If the builder proposes anything that violates `12_CONSTRAINTS_GUARDRAILS.md` (industry-platform dependency, paid SaaS where free works, automating logged-in social, rebuilding underwriting/notices, deal scoring) — reject it and re-point to the constraint.
4. Escalate to the operator only for the two assets in `13_OPEN_ITEMS.md`.

## The prompt sequence

### P0-1 (Phase 0 — infra)
> "Set up the Phase 0–2 infrastructure for the ICC Amazon File Desk per the handoff kit. Produce: the exact `05_DATA_MODEL.sql` to run in Supabase (confirm RLS, indexes, immutable referral token trigger, and shared rate limits); a Netlify site skeleton; and the SendGrid domain authentication / DMARC setup steps with a List-Unsubscribe header. Configure DocuSign env placeholders for the ISO template and Connect webhook. Do not deploy VPS/n8n/DocuSeal; that is Phase 3. Stop at the Phase 0 'done when' gate and tell me how to verify it."

### P0-2 (verify)
> "Walk me through verifying the Phase 0 gate: a record writing end-to-end and a seed email passing SendGrid domain authentication / DMARC. Give me the exact commands/checks."

### P1-1 (Phase 1 — certification + e-sign)
> "Build Phase 1: the certification funnel pages (landing → static training → short quiz → signup), `cert-signup.ts` (creates a Supabase Auth user + provisional/pending partners row + referral_token, then a DocuSign envelope from the operator's ISO agreement template, returns the signing URL or remote signing notice), and the DocuSign Connect Edge Function (HMAC-verified, idempotent on esign_envelope_id, promotes to certified, emails badge + cheat sheet + portal link). Enforce Supabase-backed signup rate limits and the corporate-email-vs-manual-vetting rule from `09_SECURITY_ABUSE.md`."

### P1-2 (portal)
> "Build the partner portal on Supabase Auth + RLS: submissions list with status, commission ledger (new vs renewal, full rate), private rank, referral link, badge/cheat-sheet download. Confirm RLS so a partner sees only their own rows (auth.uid() = partners.id). Stop at the Phase 1 gate."

### P2-1 (Phase 2 — Rescue Challenge + checker)
> "Build the Rescue Challenge upload page and `intake.ts` with MIME+content file validation (csv/pdf/xlsx, ≤15MB, header/script checks), storing to Supabase Storage and creating a submissions row. Build `checker.ts` as a rules-only logo-match (Amazon/Relay/DSP descriptor + dominance) returning likely_fundable / needs_review / out_of_box — never hard-reject. Enforce the provisional cap (1 submission until certified, ≤3 uploads/day)."

### P2-2 (routing + status + commission)
> "Wire the routing + status engine: every routing_state change emails the partner the matching status. Add the VA 'send to underwriting' action and the operator 'mark funded' action. On funded, create a commission row: clawback_eligible = funded_amount > 10000; payout_owed = funded_amount * (is_renewal ? commission_bps_renewal : commission_bps_new)/10000; flag a partner's first funded deal for manual review before payout. Stop at the Phase 2 gate."

### P2-3 (end-to-end test)
> "Run a full end-to-end test: a stranger certifies + e-signs, uploads a deal via the Rescue Challenge, the checker decides, it routes to the VA queue, I mark it funded, and the correct commission appears in the partner portal. Give me the test script and expected results."

### Gate before Phase 3
> Do NOT start Phase 3 (sourcing/outreach/boards/viral loop) until at least one real deal has been funded through Phase 2. Then return to `10_BUILD_PHASES.md` Phase 3+ and we'll sequence it.

## What to verify at every step
- Owned/independent (no industry platform crept in).
- Near-free (no paid SaaS where free/self-host works).
- Hands-off for the operator (human steps are VA or one-click operator actions only).
- Underwriting/notices untouched (engine only routes in).
