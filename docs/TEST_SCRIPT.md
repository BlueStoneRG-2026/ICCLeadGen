# End-to-End Test Script

Use this after Supabase, Netlify, SendGrid, and DocuSign are configured. VPS/n8n/DocuSeal is Phase 3 and should not be running for this test.

## 1. Corporate partner certification

1. Open the Netlify site.
2. Go to `#certify`.
3. Submit a corporate email.
4. Confirm `partners.status = provisional`.
5. Open the returned embedded DocuSign signing URL.
6. Complete signing.
7. Confirm the `docusign-connect` Edge Function sets `partners.status = certified` and records `esign_envelope_id`.

Expected: certified partner receives the branded credential email and can open the partner portal after Supabase Auth sign-in.

## 2. Generic email vetting

1. Submit certification with a Gmail/Yahoo/Outlook address.
2. Confirm `partners.status = pending_manual_vetting`.
3. Try a Rescue Challenge upload.

Expected: the upload does not route until the VA approves the partner in `#admin`; admin access requires an allowlisted Supabase Auth session.

## 3. Rescue Challenge upload

1. Open `#rescue`.
2. Upload a CSV/PDF/XLSX statement under 15 MB with Amazon, Relay, or DSP descriptors.
3. Confirm a `submissions` row exists.
4. Confirm the file exists in the private `submission-files` bucket.
5. Confirm status email sends.

Expected: `likely_fundable` or `needs_review` routes to `va_check`; `out_of_box` is warm, visible, and never a hard rejection.

## 4. Underwriting handoff

1. Open `#admin` as an allowlisted admin.
2. Click `Send to underwriting`.
3. Confirm `routing_state = underwriting`.
4. Confirm `UNDERWRITING_INTAKE_EMAIL` receives the package.

## 5. Funding and commission

1. In `#admin`, click `Mark funded`.
2. Use `fundedAmount = 42000` and `isRenewal = false`.
3. Confirm commission row:

```txt
funded_amount = 42000
payout_owed = 4620
clawback_eligible = true
payout_state = accrued
```

Expected: first funded deal remains accrued for manual review before payout authorization.
