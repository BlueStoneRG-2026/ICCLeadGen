# 12 — Constraints & Guardrails (do NOT violate)

1. **Owned & independent.** No dependency on any platform run by people in the MCA/funding industry — not as a channel, not as a data source. No funder/broker directories (deBanked, Funder Intel, etc.). Commodity/operator-owned infra (Supabase, Netlify, SendGrid, DocuSign, and later VPS/n8n/DocuSeal fallback) is allowed — switchable, portable, not competitor-run.
2. **Near-free.** Self-hosted/open-source/free-tier first. Any spend must earn out in one funded deal. Target ~$6–22/mo software.
3. **Hands-off for the operator.** Human work = a VA (seed list, Tier A phone/LinkedIn, exception/first-deal review). The operator does ~15 min/day: approve files, mark fundings. Never design a step that requires the operator to do volume work.
4. **No automated logged-in social outreach or scraping.** Public data only, ToS-aware, rate-limited, manual fallback. Outbound = email from owned domains (+ VA phone/LinkedIn for Tier A). Inbound = owned SEO/content + referral loop.
5. **Do not rebuild the operator's system.** No underwriting, sizing, fraud, stacking, UCC § 9-406 notices, serving, enforcement, settlement, or agreements. The checker is rules-only and never hard-rejects; the engine routes a file in and stops.
6. **No cost-of-capital / deal scoring / "fundability oracle" / velocity modeling.** Partner-quality scoring (behavioral) is allowed in Phase 3+; deal scoring is not.
7. **Rejected ideas — do not reintroduce:** UCC data feed, Plaid-everywhere, AI-video outreach, refi/second-position displacement, agencies-only / exclude-brokers / "Revenue Shield embed," paid industry directory listings.
8. **Deliverability discipline:** SPF/DKIM/DMARC, List-Unsubscribe, suppression enforced, DMARC progression none→quarantine→reject, modest volume.
