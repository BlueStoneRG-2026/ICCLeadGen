# Local Runtime

This is the no-live-account path for exercising the File Desk before deployment. It uses Supabase local, Netlify Functions locally, blank SendGrid credentials, and blank DocuSign credentials. Blank SendGrid logs emails only; blank DocuSign returns a stub signing URL.

## Prerequisites

- Node 22+
- Supabase CLI
- Netlify CLI
- Docker running for Supabase local

## Environment

Copy `.env.example` to `.env` and use local-only values:

```bash
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_FUNCTION_BASE=/.netlify/functions
SUPABASE_URL=http://127.0.0.1:54321
SUBMISSION_BUCKET=submission-files
SENDGRID_API_KEY=
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_ISO_TEMPLATE_ID=
LOCAL_ADMIN_BYPASS=true
APP_ORIGIN=http://127.0.0.1:8888
UNSUBSCRIBE_URL=http://127.0.0.1:8888/.netlify/functions/unsubscribe
```

After `supabase start`, copy the printed local anon key into `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY`, and copy the local service role key into `SUPABASE_SERVICE_ROLE_KEY`.

## Start

```bash
npm install
supabase start
supabase db reset
netlify dev --offline --port 8888
```

`supabase db reset` applies the migrations and `supabase/seed.sql`. The seed includes:

- `pending@filedesk.local` in `pending_manual_vetting`.
- `provisional@filedesk.local` in `provisional`.
- `certified@filedesk.local` in `certified`.
- One seeded `va_check` submission and one accrued commission for the admin dashboard.

## Full Local Flow

With `netlify dev` still running:

```bash
npm run local:flow
```

The script refuses non-local URLs unless `ALLOW_NONLOCAL_FLOW=true` is set. It runs:

1. Rescue Challenge intake with a CSV statement.
2. Rules-only checker.
3. VA send-to-underwriting admin action.
4. Mark-funded admin action.
5. Commission accrual.

Expected output includes `ok: true`, a `submissionId`, `checkerDecision: likely_fundable`, and the funded commission message.

## Teardown

For a full reset:

```bash
supabase db reset
```

To remove only the local seed and smoke-flow records, run `supabase/teardown.sql` in the local SQL editor or with a local Postgres client. To stop and remove local containers:

```bash
supabase stop --no-backup
```

Do not use these local commands with a remote `--project-ref`.
