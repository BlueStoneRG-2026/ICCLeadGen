# 14 — Builder Answers + World-Class Design Brief

## A. Answers to the builder's 8 questions (authoritative)
1. **Role:** You are the **builder**. Create the Phase 0–2 app + infra now. The PM chat directs you via `11_PM_RUNBOOK.md`.
2. **Deliverable:** A **local deployable repo** with `.env.example` placeholders for all secrets + deploy docs. Do **not** wire live services; the operator deploys with his own credentials.
3. **ISO agreement PDF:** Exists; operator provides at deploy. Build DocuSeal to accept a **configurable template ID + field mapping**; stub until provided.
4. **Sending domain:** Configurable `SENDING_DOMAIN`, default `partners.ironcrowncapital.com` (Phase 0–2 transactional). Phase 3 cold outbound uses a **separate** domain. Operator confirms at deploy.
5. **"Send to underwriting" route:** Configurable destination — Phase 0–2 = email the submission package to `UNDERWRITING_INTAKE_EMAIL` + flag in admin dashboard; design it swappable to a webhook later. Operator provides the address.
6. **Admin/VA/operator access:** Separate **admin path** with an **email allowlist** (`app_admins`) via Supabase Auth + `role=admin` check. Distinct admin dashboard (VA queue, approve partners, mark funded). Never mixed with the partner portal.
7. **Commission default:** **11% (1100 bps)**, new and renewal, per-partner adjustable within 1000–1200. Renewals pay full rate. No clawbacks when `funded_amount <= 10000`.
8. **Status enum fix:** Add `pending_manual_vetting`:
   `status TEXT NOT NULL DEFAULT 'provisional' CHECK (status IN ('pending_manual_vetting','provisional','certified','suspended'))`
   Generic-email signups → `pending_manual_vetting` (no submissions) → VA approves → `provisional`. Corporate emails → `provisional`. Still four tables.

## Operator-supplied values at deploy (the only blockers)
`ISO agreement PDF + field map`, `SENDING_DOMAIN` + DNS access, `UNDERWRITING_INTAKE_EMAIL`, `app_admins` allowlist emails.

---

## B. Design brief — world-class, high-conversion, "addictive"
**North star: Apple-level restraint meets an institutional funder you'd trust with a $250k file.** The audience is skeptical, cutthroat brokers who decide credibility in ~3 seconds. Polish *is* conversion here.

### Brand system (match ironcrowncapital.com)
- **Palette:** deep maroon / oxblood as primary, **forge-orange** as the single accent (CTAs, highlights, the certified badge), warm **cream/bone** backgrounds, charcoal/near-black text. Restrained — one accent color, used sparingly, carries the energy.
- **Typography:** **Cormorant Garamond** for display/headlines (elegant, confident), **DM Sans** for body/UI, **DM Mono** for numbers, codes, referral tokens, commission figures. Large type, generous line-height.
- **Spacing & layout:** very generous whitespace, strong grid, one clear action per screen, no clutter. Premium = fewer elements, perfect spacing, subtle depth (soft shadows, hairline borders), never flat-and-busy.
- **Motion:** subtle, purposeful micro-interactions — smooth transitions, a genuinely satisfying confirmation animation on submit/certify, an animated progress bar in the funnel, a count-up on commission figures. The "addictive" feel comes from responsive, delightful feedback, never gimmicks or dark patterns.
- **Mobile-first & fast:** brokers live on their phones; upload + portal must be flawless on mobile and load instantly. Performance is part of "world-class."

### The screens to nail (in priority of conversion impact)
1. **Rescue Challenge hero (the money screen).** One emotional headline — e.g. *"Have an Amazon deal nobody could place? Give it a home."* One dead-simple CTA: upload the file / drop the bank statement. Above the fold: the three trust signals — **10–12% paid on funded · fast clear yes/no · your merchant & commission protected.** Nothing else competing.
2. **Instant checker result (the dopamine hit).** The moment after upload: a fast, beautiful verdict — *"Likely fundable — this one's worth submitting"* with a confident forge-orange "Submit it" button. Instant positive feedback is the hook that earns the second file. (`needs_review` and `out_of_box` are warm and helpful, never a cold rejection.)
3. **Certification = a credential worth screenshotting.** "ICC Certified Amazon Deal Partner" badge + profile should look like a real, premium credential a broker is proud to show. Short, progress-barred, ceremonial funnel — feels like earning status, not filling a form.
4. **Partner portal = satisfying money + status.** A clean DM-Mono commission ledger (accrued → authorized → paid), a private rank, submission statuses moving in real time. Make accrual visually rewarding. (Public leaderboard only after real volume.)
5. **Status emails (branded, beautiful).** Every status update is an on-brand, well-typeset email — received, under review, approved, funded, commission paid. This is what keeps partners sending.

### Conversion principles
- **Submit-first, friction-last:** never make them finish training before they can upload. The file is the hook; certification follows.
- **Credibility = conversion:** institutional polish, real trust signals, protected-commission language. For this audience, looking like a serious funder converts better than any clever copy.
- **One action per screen.** Ruthless focus.
- **No dark patterns.** High conversion comes from genuine appeal, status, and ease — keep it honest; it protects the brand with a savvy audience.

### Implementation notes for the builder
- Build the frontend as a cohesive design system (tokens for the palette, type scale, spacing, motion) so every page and email is consistent.
- Self-host fonts (Cormorant Garamond, DM Sans, DM Mono) for performance + ownership.
- Keep it framework-light and fast; no heavy template/SaaS-kit look.
