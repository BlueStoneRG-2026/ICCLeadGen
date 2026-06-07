-- ICC Amazon File Desk — Phase 0-2 schema
-- Four business tables: partners, submissions, commissions, suppression.
-- One operational table: rate_limits.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  firm_name TEXT,
  referrer_type TEXT NOT NULL CHECK (referrer_type IN ('broker_mca','amazon_agency','accountant')),
  verification_url TEXT,
  status TEXT NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('pending_manual_vetting','provisional','certified','suspended')),
  quality_tier TEXT NOT NULL DEFAULT 'yellow' CHECK (quality_tier IN ('green','yellow','red')),
  quiz_completed BOOLEAN NOT NULL DEFAULT FALSE,
  esign_envelope_id TEXT UNIQUE,
  referral_token TEXT UNIQUE NOT NULL,
  commission_bps_new INT NOT NULL DEFAULT 1100 CHECK (commission_bps_new BETWEEN 1000 AND 1200),
  commission_bps_renewal INT NOT NULL DEFAULT 1100 CHECK (commission_bps_renewal BETWEEN 1000 AND 1200),
  pays_on_renewals BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  referral_token TEXT NOT NULL,
  merchant_name TEXT,
  detected_descriptor TEXT,
  is_dominant_inflow BOOLEAN NOT NULL DEFAULT FALSE,
  checker_decision TEXT NOT NULL CHECK (checker_decision IN ('likely_fundable','needs_review','out_of_box')),
  file_path TEXT,
  routing_state TEXT NOT NULL DEFAULT 'received'
    CHECK (routing_state IN ('received','under_review','missing_docs','va_check','underwriting','approved','declined','funded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE RESTRICT,
  funded_amount NUMERIC(12,2) NOT NULL,
  is_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  payout_owed NUMERIC(12,2) NOT NULL,
  clawback_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  payout_state TEXT NOT NULL DEFAULT 'accrued' CHECK (payout_state IN ('accrued','authorized','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.suppression (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_partner_routing ON public.submissions(partner_id, routing_state);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON public.submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_partner_state ON public.commissions(partner_id, payout_state);
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated ON public.rate_limits(updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_submission_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_updated_at ON public.submissions;
CREATE TRIGGER trg_submissions_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.touch_submission_updated_at();

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key TEXT, p_limit INT, p_window_ms INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_limit public.rate_limits%ROWTYPE;
  window_interval INTERVAL := (p_window_ms::TEXT || ' milliseconds')::INTERVAL;
BEGIN
  INSERT INTO public.rate_limits (key, hits)
  VALUES (p_key, 0)
  ON CONFLICT (key) DO NOTHING;

  SELECT *
  INTO current_limit
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF current_limit.window_started_at <= now() - window_interval THEN
    UPDATE public.rate_limits
    SET hits = 1,
        window_started_at = now(),
        updated_at = now()
    WHERE key = p_key;
    RETURN TRUE;
  END IF;

  IF current_limit.hits >= p_limit THEN
    UPDATE public.rate_limits
    SET updated_at = now()
    WHERE key = p_key;
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET hits = hits + 1,
      updated_at = now()
  WHERE key = p_key;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_referral_token_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referral_token IS DISTINCT FROM OLD.referral_token THEN
    RAISE EXCEPTION 'referral_token is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_token_immutable ON public.partners;
CREATE TRIGGER trg_referral_token_immutable
BEFORE UPDATE ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.reject_referral_token_change();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_self ON public.partners;
DROP POLICY IF EXISTS s_self ON public.submissions;
DROP POLICY IF EXISTS c_self ON public.commissions;

CREATE POLICY p_self ON public.partners
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY s_self ON public.submissions
  FOR SELECT
  USING (auth.uid() = partner_id);

CREATE POLICY c_self ON public.commissions
  FOR SELECT
  USING (auth.uid() = partner_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submission-files',
  'submission-files',
  false,
  15728640,
  ARRAY[
    'text/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

COMMIT;

-- Commission math used by admin-action:
-- payout_owed = round(funded_amount * (is_renewal ? commission_bps_renewal : commission_bps_new) / 10000, 2)
-- clawback_eligible = funded_amount > 10000
