# Deployment

`docs/DEPLOY_CHECKLIST.md` and `docs/DEPLOY_RUNBOOK.md` are the current deploy source of truth. This file is retained as a compact overview.

Phase 0-2 runs on Netlify + Supabase + SendGrid + DocuSign. Do not deploy the VPS/n8n/DocuSeal stack for Phase 0-2.

## 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_phase_0_2_schema.sql` in the SQL editor.
3. Confirm the private `submission-files` Storage bucket exists.
4. Deploy Edge Functions:

```bash
supabase functions deploy docusign-connect
supabase functions deploy sendgrid-events
```

5. Set Edge Function secrets:

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set DOCUSIGN_CONNECT_HMAC_SECRET=...
supabase secrets set SENDGRID_EVENT_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----...'
supabase secrets set CERTIFIED_EMAIL_WEBHOOK_URL=https://YOUR_NETLIFY_DOMAIN/.netlify/functions/certified-email
supabase secrets set INTERNAL_WEBHOOK_SECRET=...
```

Webhook verification fails closed in deployed Supabase environments. `DOCUSIGN_CONNECT_HMAC_SECRET` and `SENDGRID_EVENT_PUBLIC_KEY` are required in production. `ALLOW_UNSIGNED_WEBHOOKS=true` is only for local Supabase testing and is ignored unless the runtime is pointed at localhost/127.0.0.1 or explicitly marked local.

## 2. Netlify

1. Create a Netlify site from this repo.
2. Set build command `npm run build` and publish directory `dist`.
3. Add all values from `.env.example` to Netlify environment variables.
4. Set `VITE_DEMO_MODE=false`.
5. Deploy.

Live partner portal and admin dashboard access require Supabase Auth. The frontend stores the Supabase session and passes bearer tokens to `portal-data`, `admin-data`, and `admin-action`.

## 3. SendGrid and DNS

Use `SENDING_DOMAIN=partners.ironcrowncapital.com` unless Juan confirms another Phase 0-2 transactional domain.

Configure SendGrid domain authentication for the sending domain and add the CNAME/TXT records SendGrid provides. Keep DMARC at `p=none` for the first monitoring window, then move to quarantine/reject after healthy delivery.

Configure SendGrid Event Webhook:

- Endpoint: deployed Supabase `sendgrid-events` URL.
- Events: at least `bounce`, `dropped`, and `spamreport`.
- Security: enable Signed Event Webhook and copy the public verification key to `SENDGRID_EVENT_PUBLIC_KEY`.

The app also sends `List-Unsubscribe` and `List-Unsubscribe-Post` headers on transactional notices.

## 4. DocuSign

Create the ISO partner agreement as a DocuSign template.

Required values:

```bash
DOCUSIGN_AUTH_SERVER=account-d.docusign.com      # account.docusign.com for production
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_USER_ID=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_ISO_TEMPLATE_ID=
DOCUSIGN_TEMPLATE_ROLE_NAME=Signer1
DOCUSIGN_RETURN_URL=https://partners.ironcrowncapital.com/#portal
DOCUSIGN_FIELD_MAP_JSON={}
DOCUSIGN_CONNECT_HMAC_SECRET=
```

The ISO agreement flow uses embedded/in-app signing only. The envelope includes `clientUserId = partner_id`, returns a recipient view URL using `DOCUSIGN_RETURN_URL`, and stores `partner_id` as a DocuSign text custom field so the Connect webhook can reconcile the completed envelope.

Configure DocuSign Connect:

- Endpoint: deployed Supabase `docusign-connect` URL.
- Event: envelope completed.
- Include envelope custom fields in the payload.
- Enable HMAC and set the same secret as `DOCUSIGN_CONNECT_HMAC_SECRET`.

## 5. Admin access

Admin is separate from the partner portal. Add operator and VA emails to:

```bash
ADMIN_EMAILS=operator@example.com,va@example.com
```

Those users must exist in Supabase Auth. Netlify Functions verify the bearer token email against the allowlist.

`LOCAL_ADMIN_BYPASS=true` is for local/dev only. Deployed Netlify functions ignore it and continue to require Supabase Auth plus the `ADMIN_EMAILS` allowlist.

## 6. Phase 3 deferred infrastructure

`infra/` is preserved for later n8n/sourcing orchestration and a possible DocuSeal fallback. Do not deploy it until Phase 3 is explicitly approved.
