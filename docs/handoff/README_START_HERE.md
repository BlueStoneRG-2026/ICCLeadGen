# ICC Amazon File Desk — Build Handoff Kit
## START HERE (for the Project Manager)

You are the **Project Manager** for building Iron Crown Capital's automated, owned, near-free **partner lead-generation engine** ("Amazon File Desk"). A separate builder chat writes the code; **you direct it, phase by phase, using the prompts in `11_PM_RUNBOOK.md`.**

### What this engine does (one sentence)
It automatically recruits, certifies, signs, tracks, and pays referral partners (MCA brokers first, then Amazon agencies/accountants) who send Iron Crown Amazon-economy funding deals — running at ~$6–22/mo with ~15 min/day from the operator.

### What it does NOT do
It does **not** touch underwriting, deal sizing, fraud, stacking, UCC § 9-406 notices, serving, enforcement, or settlement. The operator has run those for nine years and owns them. The engine only **routes a qualified file into the operator's existing system.** (See `03_SCOPE_AND_OWNERSHIP.md`.)

### The hard rules (never violate — see `12_CONSTRAINTS_GUARDRAILS.md`)
1. **Owned & independent only.** Nothing may depend on any platform run by people in the MCA/funding industry (no funder/broker directories, no industry SaaS). Commodity/operator-owned infra (Supabase, Netlify, SendGrid, DocuSign, and later VPS/n8n/DocuSeal fallback) is fine — it's switchable and not run by competitors.
2. **Near-free.** Self-hosted/open-source/free-tier first. Any spend must earn out in one deal.
3. **Hands-off for the operator.** The human layer is a VA, never the operator.
4. **No automated logged-in social outreach/scraping.** Public data only; email from owned domains; inbound via owned SEO/content/referral loop.
5. **No cost-of-capital / deal scoring.** The "checker" is rules-only and never hard-rejects.

### How to use this kit
- Read in order: `01` brief → `02` decisions → `03` scope → `04` architecture → `05` schema → `06` workflows → `07` frontend → `08` integrations → `09` security → `10` build phases → `11` PM runbook.
- Everything is **decided.** There are no open design questions. The operator will supply two assets at build time (see `13_OPEN_ITEMS.md`): the existing ISO partner agreement PDF (for e-sign) and DNS access for sending domains.

### The immediate next step
Open `11_PM_RUNBOOK.md` and issue **Prompt P0-1** to the builder to stand up infrastructure (Phase 0). Build only **Phase 0–2** first (first certified partner + first routed file). Everything else is Phase 3+ and explicitly deferred.

### File index
- `01_PROJECT_BRIEF.md` — mission, niche, partners, offer, the engine in plain terms
- `02_DECISIONS_LOCKED.md` — every decision + rationale
- `03_SCOPE_AND_OWNERSHIP.md` — in scope vs operator-owned
- `04_ARCHITECTURE.md` — system diagram, stack, independence principle
- `05_DATA_MODEL.sql` — runnable Phase 0–2 schema (4 tables, RLS, indexes)
- `06_WORKFLOWS_n8n.md` — automation workflows
- `07_FRONTEND_netlify.md` — pages + serverless functions
- `08_INTEGRATIONS_ENV.md` — services, env vars, deliverability config
- `09_SECURITY_ABUSE.md` — validation, abuse throttles, quality tiers, RLS
- `10_BUILD_PHASES.md` — phases + acceptance criteria + deferred list
- `11_PM_RUNBOOK.md` — your playbook: the prompts to give the builder
- `12_CONSTRAINTS_GUARDRAILS.md` — the do-not list
- `13_OPEN_ITEMS.md` — the two assets the operator provides at build time

- `14_BUILDER_ANSWERS_AND_DESIGN.md` — builder Q&A answers + world-class design brief
