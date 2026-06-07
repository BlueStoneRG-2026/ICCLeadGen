# Claude Review Notes

This branch updates the Phase 0-2 File Desk build after Claude's review. The current active stack is Netlify + Supabase + SendGrid + DocuSign. VPS/n8n/DocuSeal is deferred to Phase 3.

## What Changed After Claude's Review

- SES was replaced with SendGrid via `@sendgrid/mail`.
- The old SES Edge Function was replaced by `sendgrid-events`, with signed Event Webhook verification and suppression writes for `bounce`, `dropped`, and `spamreport`.
- DocuSeal envelope creation was replaced with DocuSign eSignature template envelope creation using JWT auth.
- The old DocuSeal webhook was replaced by `docusign-connect`, with HMAC verification and idempotent completion handling.
- Partner portal and admin dashboard now have real Supabase Auth sign-in/session handling in live mode.
- In-memory signup rate limiting moved to a Supabase-backed `rate_limits` mechanism.
- Transactional/status emails are wrapped in an ICC-branded HTML shell.
- `partners.referral_token` is now immutable through a database trigger.

## Things To Review Closely

1. Webhook verification now fails closed. Missing `SENDGRID_EVENT_PUBLIC_KEY` or `DOCUSIGN_CONNECT_HMAC_SECRET` returns 401 unless `ALLOW_UNSIGNED_WEBHOOKS=true` is used against a local Supabase runtime only.
2. DocuSign mode is embedded/in-app signing. The helper always creates a recipient view using `DOCUSIGN_RETURN_URL`, sets `clientUserId` to `partner_id`, and writes `partner_id` as a text custom field for Connect reconciliation.
3. DocuSign field map: `DOCUSIGN_FIELD_MAP_JSON` accepts either a full `tabs` object or simple tab-label-to-source mappings. Test against Juan's actual ISO template labels.
4. Rate limits: the shared table is intentionally tiny and cheap. If abuse grows, add cleanup for stale `rate_limits` rows.
5. Admin audit trail: still deferred. A fifth audit table is worth approving once a VA is marking deals funded.

## Guardrails To Keep

- Do not add Phase 3 features yet.
- Do not introduce MCA/funding-industry platform dependencies.
- Do not build underwriting, deal scoring, UCC notices, enforcement, or settlement.
- Keep the checker rules-only and never hard-reject files.
- Keep transactional and future cold-outbound domains separate.
