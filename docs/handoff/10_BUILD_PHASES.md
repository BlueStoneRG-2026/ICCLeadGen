# 10 — Build Phases & Acceptance Criteria

Build **Phase 0–2 only** first. Each phase has a hard "done when" gate.

## Phase 0 — Infrastructure (Day 1–2)
- VPS + Docker Compose: deferred to Phase 3; do not deploy for Phase 0–2.
- Supabase project + run `05_DATA_MODEL.sql` (4 tables, RLS, indexes).
- Netlify site + DNS; SendGrid domain authentication + DMARC (p=none) + List-Unsubscribe.
- DocuSign configured with the operator's ISO partner agreement template.
- **Done when:** a test record writes end-to-end and a seed email delivers through SendGrid with passing domain auth.

## Phase 1 — Certification + e-sign (Day 3–5)
- Pages: landing → training → quiz → signup.
- `cert-signup.ts`: Supabase Auth user + provisional/pending `partners` row → DocuSign envelope → signing URL.
- DocuSign Connect webhook (Edge Function, idempotent) → `certified` → badge + cheat sheet + portal link.
- Partner portal (Auth + RLS): submissions, commission ledger, private rank, referral link.
- **Done when:** a stranger self-certifies and e-signs the ISO agreement with zero operator action.

## Phase 2 — Rescue Challenge + checker + routing (Day 6–10)
- Rescue Challenge upload → `intake.ts` (MIME+content validation) → Storage → `checker.ts` → `submissions` row.
- Status-update emails on each `routing_state` transition.
- VA "send to underwriting" button; operator "mark funded" button → commission row (renewal-aware; clawback_eligible only if > $10k).
- **Done when:** an uploaded statement returns a decision, routes to the VA queue, and a funded mark creates the correct commission.

## Phase 3+ (AFTER the first funded deal — deferred, do not build yet)
Sourcing (VA seed list + n8n enrichment), segmented outbound email (Tier B/C; Tier A = VA phone/LinkedIn), high-volume suppression pipeline, VPS/n8n/DocuSeal fallback if needed, the 3-ask viral loop, boards + monthly File Notes, public leaderboard, automated partner-quality scoring, source-decay engine.
