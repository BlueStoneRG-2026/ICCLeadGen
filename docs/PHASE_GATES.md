# Phase 0-2 Gates

## Phase 0

Done when:

- Supabase schema is applied and RLS policies exist.
- Netlify deploy serves the frontend and functions.
- SendGrid domain authentication passes and DMARC starts at `p=none`.
- A test transactional email logs or sends through SendGrid with `List-Unsubscribe`.
- DocuSign integration values are present or the e-sign path is visibly stubbed.
- `infra/` remains undeployed and marked Phase 3-only.

Checks:

In Supabase SQL editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('partners','submissions','commissions','suppression','rate_limits');
```

## Phase 1

Done when a stranger can:

- Complete the certification signup.
- Receive a DocuSign signing URL or remote signing notice.
- Sign the ISO agreement.
- Become `certified` through the DocuSign Connect webhook if not pending manual vetting.
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
