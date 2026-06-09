# Operator / VA Day-1 Guide

Use the admin dashboard only from an allowlisted Supabase Auth email in `ADMIN_EMAILS`. Do not share admin accounts.

## Daily Loop

1. Open the admin dashboard.
2. Review `Manual vetting`.
3. Approve real partners with credible identity/domain.
4. Leave suspicious or unclear partners pending until Juan decides.
5. Review the `VA queue`.
6. For workable files, click `Send to underwriting`.
7. Confirm the underwriting handoff email/package was sent.
8. When Juan confirms a deal funded, enter funded amount and renewal status, then click `Mark funded`.

## First-Funded Review And Payouts

1. In `Payout review`, any first funded deal shows `First funded deal`.
2. Juan/VA reviews partner quality before payout authorization.
3. Click `Clear review` only after review is complete.
4. Click `Authorize` only after review is cleared and payout is approved.
5. Click `Mark paid` only after payment actually goes out.
6. Do not skip states. The system enforces `accrued -> authorized -> paid`.

## Email Outbox

1. Check `Email outbox` daily.
2. `queued` or `failed` items can be retried.
3. `dead` items need operator review before retrying outside the app.
4. If a certified partner says they missed the email, use `Certified emails -> Resend`; it goes through the same durable outbox.

## Bounce / Suppression

1. Check SendGrid suppression and the app `suppression` table when partners report missing email.
2. Bounce, dropped, and spamreport events are written by the SendGrid webhook.
3. Do not manually remove a suppression unless Juan approves and the address is confirmed safe.

## What Not To Do

- Do not approve generic-email partners unless they are manually verified.
- Do not mark funded until Juan confirms funding.
- Do not authorize first-funded payouts before review is cleared.
- Do not edit commission amounts manually in the database.
- Do not touch SendGrid, DocuSign, Supabase, Netlify, or DNS settings outside the runbook.
