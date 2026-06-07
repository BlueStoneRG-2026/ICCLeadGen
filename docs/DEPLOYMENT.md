# Deployment

## 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_phase_0_2_schema.sql` in the SQL editor.
3. Confirm the private `submission-files` Storage bucket exists.
4. Deploy Edge Functions:

```bash
supabase functions deploy docuseal-webhook
supabase functions deploy ses-events
```

5. Set Edge Function secrets:

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set DOCUSEAL_WEBHOOK_SECRET=...
supabase secrets set SES_EVENTS_SECRET=...
supabase secrets set CERTIFIED_EMAIL_WEBHOOK_URL=https://YOUR_NETLIFY_DOMAIN/.netlify/functions/certified-email
supabase secrets set INTERNAL_WEBHOOK_SECRET=...
```

## 2. Netlify

1. Create a Netlify site from this repo.
2. Set build command `npm run build` and publish directory `dist`.
3. Add all values from `.env.example` to Netlify environment variables.
4. Set `VITE_DEMO_MODE=false`.
5. Deploy.

## 3. SES and DNS

Use `SENDING_DOMAIN=partners.ironcrowncapital.com` unless Juan confirms another Phase 0-2 transactional domain.

DNS records:

```txt
partners.ironcrowncapital.com TXT "v=spf1 include:amazonses.com -all"
_dmarc.partners.ironcrowncapital.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@partners.ironcrowncapital.com; fo=1"
```

Add the DKIM CNAME records SES provides for the domain. Start at `p=none`, move to quarantine around weeks 3-4, and reject around week 5+ after monitoring.

Configure SES bounce/complaint events to call the deployed `ses-events` Edge Function with `x-ses-events-secret`.

## 4. VPS services

On the Hetzner VPS:

```bash
cd infra
cp .env.example .env
openssl rand -hex 64
docker compose up -d
docker compose ps
```

Put the generated secret into `DOCUSEAL_SECRET_KEY_BASE`. Point DNS for `N8N_HOST` and `DOCUSEAL_HOST` at the VPS before starting Caddy so TLS can issue.

After Juan provides the ISO agreement PDF:

1. Upload it into DocuSeal.
2. Map signature/date/name/company fields.
3. Put the template ID into `DOCUSEAL_TEMPLATE_ID`.
4. Put any required field defaults into `DOCUSEAL_FIELD_MAP_JSON`.
5. Configure DocuSeal webhook URL to the deployed Supabase `docuseal-webhook` endpoint.

## 5. Admin access

Admin is separate from the partner portal. Add operator and VA emails to:

```bash
ADMIN_EMAILS=operator@example.com,va@example.com
```

Those users must exist in Supabase Auth. Netlify Functions verify the bearer token email against the allowlist.
