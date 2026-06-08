# Deploy Checklist

This is the single source of truth for the final production deploy. Do not deploy from loose ZIPs. Do not reuse existing Netlify sites, Supabase projects, SendGrid webhooks, or DocuSign Connect configs.

## Isolation Rules

- Create a brand-new Netlify site dedicated to this app.
- Use a brand-new Supabase project dedicated to this app.
- Pass `--site <new-site-id>` on every Netlify command.
- Pass `--project-ref <new-project-ref>` on every Supabase command.
- Never attach `partners.ironcrowncapital.com` until the default Netlify subdomain has passed testing.
- Never touch registrar DNS except for the exact records listed during the later deploy session.
- Never overwrite an existing SendGrid Event Webhook or DocuSign Connect config.

## Operator-Supplied Values

These must be supplied at deploy time and must not be committed:

| Key | Where to get it | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | New dedicated Supabase project API settings | Also used by Edge Functions. |
| `SUPABASE_ANON_KEY` | New dedicated Supabase project API settings | Same value as `VITE_SUPABASE_ANON_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY` | New dedicated Supabase project API settings | Secret. Server and Edge only. |
| `VITE_SUPABASE_URL` | New dedicated Supabase project API settings | Public frontend value. |
| `VITE_SUPABASE_ANON_KEY` | New dedicated Supabase project API settings | Public frontend value. |
| `SENDGRID_API_KEY` | SendGrid Settings > API Keys | Secret. Mail Send permission only. |
| `SENDGRID_EVENT_PUBLIC_KEY` | SendGrid Event Webhook signed verification | Public verification key, but still set as Edge secret. |
| `DOCUSIGN_INTEGRATION_KEY` | Dedicated DocuSign app/integration | Use a new integration for this project if possible. |
| `DOCUSIGN_USER_ID` | DocuSign API user GUID | Must grant consent for JWT impersonation. |
| `DOCUSIGN_PRIVATE_KEY` | Dedicated DocuSign integration RSA private key | Secret. Preserve line breaks as `\\n` if setting via CLI. |
| `DOCUSIGN_ACCOUNT_ID` | DocuSign account ID | Use the intended account only. |
| `DOCUSIGN_ISO_TEMPLATE_ID` | New ISO partner agreement template | Do not edit existing contract-drafter templates. |
| `DOCUSIGN_FIELD_MAP_JSON` | Template tab labels mapped to app fields | Example: `{"Partner Name":"fullName","Firm":"firmName"}`. |
| `DOCUSIGN_CONNECT_HMAC_SECRET` | New DocuSign Connect config | Secret. Must match Edge Function env. |
| `INTERNAL_WEBHOOK_SECRET` | Generate a new random value | Used from Edge Function to Netlify `certified-email`. |
| `CERTIFIED_EMAIL_WEBHOOK_URL` | New Netlify site function URL | `https://<site>.netlify.app/.netlify/functions/certified-email`. |
| `UNDERWRITING_INTAKE_EMAIL` | Juan/operator | Phase 0-2 handoff mailbox. |
| `ADMIN_EMAILS` | Juan/operator | Comma-separated VA/operator allowlist. |
| `APP_ORIGIN` | New Netlify site URL | Default subdomain first; custom domain later. |

## Netlify Runtime Env

Set these on the new dedicated Netlify site only:

```bash
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_FUNCTION_BASE=/.netlify/functions
APP_ORIGIN=https://<new-site>.netlify.app
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUBMISSION_BUCKET=submission-files
SENDGRID_API_KEY=
SENDING_DOMAIN=partners.ironcrowncapital.com
TRANSACTIONAL_FROM=Iron Crown File Desk <desk@partners.ironcrowncapital.com>
REPLY_TO_EMAIL=desk@partners.ironcrowncapital.com
UNSUBSCRIBE_URL=https://<new-site>.netlify.app/.netlify/functions/unsubscribe
VA_QUEUE_EMAIL=
DOCUSIGN_AUTH_SERVER=account.docusign.com
DOCUSIGN_BASE_PATH=https://www.docusign.net/restapi
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_USER_ID=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_ISO_TEMPLATE_ID=
DOCUSIGN_TEMPLATE_ROLE_NAME=Signer1
DOCUSIGN_RETURN_URL=https://<new-site>.netlify.app/#portal
DOCUSIGN_FIELD_MAP_JSON={}
INTERNAL_WEBHOOK_SECRET=
ADMIN_EMAILS=
LOCAL_ADMIN_BYPASS=false
UNDERWRITING_INTAKE_EMAIL=
```

## Supabase Edge Function Secrets

Set these on the new dedicated Supabase project only:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DOCUSIGN_CONNECT_HMAC_SECRET=
SENDGRID_EVENT_PUBLIC_KEY=
CERTIFIED_EMAIL_WEBHOOK_URL=https://<new-site>.netlify.app/.netlify/functions/certified-email
INTERNAL_WEBHOOK_SECRET=
ALLOW_UNSIGNED_WEBHOOKS=false
SUPABASE_FUNCTIONS_LOCAL=false
```

Webhook verification fails closed in production. Missing `DOCUSIGN_CONNECT_HMAC_SECRET` or `SENDGRID_EVENT_PUBLIC_KEY` must return 401.

## SendGrid DNS

The transactional sending domain is `partners.ironcrowncapital.com`. The exact CNAME/TXT values are generated inside SendGrid and must be copied exactly from Sender Authentication for this domain. Do not reuse the old `em8371.bluestonerg.com` or `em1978.tryangleai.com` records.

Record slots to fill during deploy:

| Type | Host/name | Value/target | TTL |
| --- | --- | --- | --- |
| CNAME | `em...partners.ironcrowncapital.com` | `u...wl....sendgrid.net` | 1 hour |
| CNAME | `s1._domainkey.partners.ironcrowncapital.com` | `s1.domainkey.u....wl....sendgrid.net` | 1 hour |
| CNAME | `s2._domainkey.partners.ironcrowncapital.com` | `s2.domainkey.u....wl....sendgrid.net` | 1 hour |
| TXT | `_dmarc.partners.ironcrowncapital.com` | `v=DMARC1; p=none;` | 1 hour |

If SendGrid has already verified `partners.ironcrowncapital.com`, copy the current exact records from SendGrid and Wix into the deploy notes. If any value differs, stop and reconcile before sending mail.

## SendGrid Event Webhook

Before creating anything, check whether the account already has an Event Webhook.

- If one exists, do not overwrite it. Stop and have Juan create a separate webhook or approve a safe account-level plan.
- If none exists, create a new webhook:
  - Endpoint: `https://<new-project-ref>.functions.supabase.co/sendgrid-events`
  - Events: `bounce`, `dropped`, `spamreport`
  - Security: Signed Event Webhook enabled
  - Copy the public verification key to `SENDGRID_EVENT_PUBLIC_KEY`

## DocuSign

Use a dedicated ISO partner agreement template and avoid touching any existing contract-drafter templates or Connect configs.

Required setup:

- Create or confirm a dedicated DocuSign integration/app for File Desk JWT auth.
- Generate or use a dedicated RSA keypair for this app.
- Grant JWT impersonation consent for `DOCUSIGN_USER_ID`.
- Create a new ISO partner agreement template.
- Template role name must match `DOCUSIGN_TEMPLATE_ROLE_NAME`.
- Add tabs matching `DOCUSIGN_FIELD_MAP_JSON`.
- The app creates embedded recipient views using `clientUserId = partner_id`.
- The envelope includes text custom fields `partner_id` and `referral_token`.

Connect setup:

- Create a new Connect config only for File Desk.
- Endpoint: `https://<new-project-ref>.functions.supabase.co/docusign-connect`
- Event: envelope completed
- Include envelope custom fields
- Enable HMAC and store the same secret in `DOCUSIGN_CONNECT_HMAC_SECRET`

## Supabase Commands

Use the new project ref on every command:

```bash
supabase db push --project-ref <new-project-ref>
supabase functions deploy sendgrid-events --project-ref <new-project-ref>
supabase functions deploy docusign-connect --project-ref <new-project-ref>
supabase secrets set --project-ref <new-project-ref> KEY=value
```

Do not run these against any existing project.

## Netlify Commands

Create the site, capture the new site ID, then pass it every time:

```bash
netlify sites:create --name icc-file-desk
netlify env:set KEY value --site <new-site-id>
netlify deploy --site <new-site-id>
netlify deploy --prod --site <new-site-id>
```

Do not run `netlify link`. Do not run a bare deploy.

## Phase 3 Deferred

Do not deploy `infra/`, n8n, VPS, Watchtower, or DocuSeal for Phase 0-2. They remain Phase 3 options only after a real funded deal proves the flow.
