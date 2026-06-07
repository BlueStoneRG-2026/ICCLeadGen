# 02 — Decisions (LOCKED)

| # | Decision | Value | Rationale |
|---|---|---|---|
| 1 | Commission rate | 10–12% of funded amount | Operator-set; generous, attracts brokers |
| 2 | Renewal commission | **Full rate, paid on renewals** | Strongest retention hook; $0 extra cost |
| 3 | Clawbacks | **None on deals ≤ $10,000** | Operator policy; keep commission logic simple; deals > $10k follow the operator's ISO agreement terms |
| 4 | Partner agreement / e-sign | **Operator's existing ISO partner agreement**, loaded into DocuSeal | Operator already has it; no drafting |
| 5 | Partner identity | **Supabase Auth user = `partners.id`** | Cleanest RLS for the portal |
| 6 | Tier A outreach | **VA phone/LinkedIn** (automated email for Tier B/C) | Brokers convert 5–10× better by phone; email-scraping to brokers is unreliable |
| 7 | Sourcing | **VA-built public seed list + n8n enrichment** (not automated email-scraping) | Google Places returns no email; broker sites obfuscate; honest, owned approach |
| 8 | Hosting | **Self-hosted Docker on a VPS (Hetzner default)** | Max ownership, lowest cost (~$6–12/mo) |
| 9 | E-sign tool | **DocuSeal** (self-hosted, open-source) | Free, API/webhook capable |
| 10 | Entry flow | **File-first** ("Submit first, certify while we review") | The live file is the real qualification |
| 11 | Checker | **Rules-only logo-match; never hard-rejects** | Underwriting stays the operator's |
| 12 | Phase 0–2 scope | **4 tables only** (partners, submissions, commissions, suppression) | Get to first certified partner + first file fast |
| 13 | Leaderboard | **Private rank first; public only after real volume** | Empty leaderboard looks weak |
| 14 | Industry platforms | **None, anywhere** (no directories as channel or source) | Competitors can cut us off / observe us |
| 15 | Niche scope (day 1) | **Full Amazon ecosystem** — sellers + Relay + DSP | Wider net, specialist positioning, no extra cost |

**Rejected (do not reintroduce):** funder/broker directories (deBanked/Funder Intel) as channel or source; UCC data feed; scored "fundability oracle"; Plaid-everywhere; AI-video outreach; refi/second-position displacement; agencies-only / "Revenue Shield embed" / excluding brokers (rejected 3×); cost-of-capital/velocity modeling.
