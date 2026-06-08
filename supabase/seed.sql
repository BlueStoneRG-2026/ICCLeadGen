-- Local-only seed data for ICC Amazon File Desk.
-- Supabase CLI applies this after migrations during `supabase db reset`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'pending@filedesk.local',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Pending Manual"}'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'certified@filedesk.local',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Certified Partner"}'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'provisional@filedesk.local',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Provisional Partner"}'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.partners (
  id,
  email,
  full_name,
  firm_name,
  referrer_type,
  status,
  quality_tier,
  quiz_completed,
  esign_envelope_id,
  referral_token,
  commission_bps_new,
  commission_bps_renewal,
  pays_on_renewals
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'pending@filedesk.local',
    'Pending Manual',
    'Generic Broker Test',
    'broker_mca',
    'pending_manual_vetting',
    'yellow',
    true,
    null,
    'ICC-PEND-LOCAL',
    1100,
    1100,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'certified@filedesk.local',
    'Certified Partner',
    'Certified Test Desk',
    'amazon_agency',
    'certified',
    'green',
    true,
    'local-envelope-certified',
    'ICC-CERT-LOCAL',
    1100,
    1100,
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'provisional@filedesk.local',
    'Provisional Partner',
    'Provisional Test Desk',
    'accountant',
    'provisional',
    'yellow',
    true,
    null,
    'ICC-PROV-LOCAL',
    1100,
    1100,
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.submissions (
  id,
  partner_id,
  referral_token,
  merchant_name,
  detected_descriptor,
  is_dominant_inflow,
  checker_decision,
  file_path,
  routing_state
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    'ICC-CERT-LOCAL',
    'Seed Amazon Seller',
    'AMAZON.COM',
    true,
    'likely_fundable',
    'local/seed-amazon-seller.csv',
    'va_check'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.commissions (
  partner_id,
  submission_id,
  funded_amount,
  is_renewal,
  payout_owed,
  clawback_eligible,
  payout_state
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  25000,
  false,
  2750,
  true,
  'accrued'
)
ON CONFLICT DO NOTHING;
