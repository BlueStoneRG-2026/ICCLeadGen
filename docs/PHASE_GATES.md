# Phase 0-2 Gates

## Phase 0

Done when:

- VPS stack runs n8n, DocuSeal, Caddy, and Watchtower.
- Supabase schema is applied and RLS policies exist.
- Netlify deploy serves the frontend and functions.
- SES domain passes SPF, DKIM, and DMARC `p=none`.
- A test transactional email logs or sends with `List-Unsubscribe`.

Checks:

```bash
cd infra
docker compose ps
curl -I https://$N8N_HOST/healthz
curl -I https://$DOCUSEAL_HOST
```

In Supabase SQL editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('partners','submissions','commissions','suppression');
```

## Phase 1

Done when a stranger can:

- Complete the certification signup.
- Receive a DocuSeal signing URL.
- Sign the ISO agreement.
- Become `certified` through the webhook if not pending manual vetting.
- See only their own portal rows.

Generic email accounts should remain `pending_manual_vetting` until a VA approves them.

## Phase 2

Done when:

- A partner uploads CSV, PDF, or XLSX up to 15 MB.
- MIME and content validation run before storage.
- The checker returns `likely_fundable`, `needs_review`, or `out_of_box` without hard rejection.
- `likely_fundable` and `needs_review` files route to `va_check`.
- VA can send to underwriting, which emails `UNDERWRITING_INTAKE_EMAIL`.
- Operator can mark funded.
- Commission row calculates correctly:

```txt
payout_owed = funded_amount * commission_bps / 10000
clawback_eligible = funded_amount > 10000
```

## Do not start Phase 3

Phase 3 is blocked until one real deal has funded through Phase 2.
