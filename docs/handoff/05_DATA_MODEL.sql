-- ICC Amazon File Desk — Phase 0-2 schema (Supabase / Postgres)
-- 4 tables only. Everything else is Phase 3+.
-- Partner identity = Supabase Auth user (partners.id = auth.uid()).

BEGIN;

CREATE TABLE public.partners (
  id UUID PRIMARY KEY REFERENCES auth.users(id),       -- created together with the auth user
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  firm_name TEXT,
  referrer_type TEXT NOT NULL CHECK (referrer_type IN ('broker_mca','amazon_agency','accountant')),
  verification_url TEXT,                                 -- corporate domain auto-promotes; generic -> manual vetting
  status TEXT NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional','certified','suspended')),
  quality_tier TEXT NOT NULL DEFAULT 'yellow' CHECK (quality_tier IN ('green','yellow','red')),
  quiz_completed BOOLEAN NOT NULL DEFAULT FALSE,
  esign_envelope_id TEXT UNIQUE,                         -- DocuSeal idempotency key
  referral_token TEXT UNIQUE NOT NULL,                   -- immutable attribution
  commission_bps_new INT NOT NULL DEFAULT 1100 CHECK (commission_bps_new BETWEEN 1000 AND 1200),
  commission_bps_renewal INT NOT NULL DEFAULT 1100 CHECK (commission_bps_renewal BETWEEN 0 AND 1200), -- = new (full rate)
  pays_on_renewals BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  referral_token TEXT NOT NULL,                          -- immutable even if partner record changes
  merchant_name TEXT,
  detected_descriptor TEXT,                              -- AMAZON.COM / RELAY / DSP
  is_dominant_inflow BOOLEAN NOT NULL DEFAULT FALSE,
  checker_decision TEXT NOT NULL CHECK (checker_decision IN ('likely_fundable','needs_review','out_of_box')),
  file_path TEXT,                                        -- Supabase Storage key
  routing_state TEXT NOT NULL DEFAULT 'received'
    CHECK (routing_state IN ('received','under_review','missing_docs','va_check','underwriting','approved','declined','funded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.commissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE RESTRICT,
  funded_amount NUMERIC(12,2) NOT NULL,
  is_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  payout_owed NUMERIC(12,2) NOT NULL,                    -- funded * (is_renewal ? bps_renewal : bps_new)/10000
  clawback_eligible BOOLEAN NOT NULL DEFAULT FALSE,      -- FALSE when funded_amount <= 10000 (no clawbacks); else per ISO agreement
  payout_state TEXT NOT NULL DEFAULT 'accrued' CHECK (payout_state IN ('accrued','authorized','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE public.suppression (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_submissions_partner_routing ON public.submissions(partner_id, routing_state);
CREATE INDEX idx_submissions_created ON public.submissions(created_at DESC);
CREATE INDEX idx_commissions_partner_state ON public.commissions(partner_id, payout_state);

-- Row-Level Security: a partner sees only their own rows; writes go through the service role (n8n / edge functions).
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_self ON public.partners    FOR SELECT USING (auth.uid() = id);
CREATE POLICY s_self ON public.submissions FOR SELECT USING (auth.uid() = partner_id);
CREATE POLICY c_self ON public.commissions FOR SELECT USING (auth.uid() = partner_id);

COMMIT;

-- NOTE for builder: set clawback_eligible = (funded_amount > 10000) when inserting a commission row.
-- Commission math: payout_owed = round(funded_amount * (is_renewal ? commission_bps_renewal : commission_bps_new) / 10000, 2)
