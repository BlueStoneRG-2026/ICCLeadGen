# 03 — Scope & Ownership

## IN SCOPE (build this)
The partner lead-generation engine: certification funnel, Rescue Challenge intake, rules-only checker, partner records, e-sign onboarding, routing to the operator's system, automatic status updates, partner portal, commission ledger, and (Phase 3+) sourcing/outreach/boards/viral loop.

## OUT OF SCOPE (operator owns — do NOT build or rebuild)
- Underwriting, deal sizing, fraud review, MCA stacking analysis.
- UCC § 9-406 notice generation, where/how to serve, enforcement, settlement.
- The ISO partner agreement and the merchant agreements (operator provides the ISO agreement PDF for e-sign; merchant agreements live in the operator's funding process, not here).
- Any decision about whether/how much to fund — the engine routes a file in; a human (operator) funds.

## The handoff boundary
The engine's job ends when a qualified file is **routed into the operator's existing underwriting/funding process** and when the operator **marks a deal funded** (which the engine uses to compute commission). Everything between those two points is the operator's nine-year system.
