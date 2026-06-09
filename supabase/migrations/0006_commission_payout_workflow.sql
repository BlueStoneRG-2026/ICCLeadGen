-- Strict, audited commission payout workflow.

BEGIN;

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS first_funded_review_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.commission_payout_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id BIGINT NOT NULL REFERENCES public.commissions(id) ON DELETE RESTRICT,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  old_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_payout_audit_commission
  ON public.commission_payout_audit(commission_id, created_at DESC);

ALTER TABLE public.commission_payout_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.clear_commission_first_funded_review(
  p_commission_id BIGINT,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  commission_row public.commissions%ROWTYPE;
  first_commission_id BIGINT;
BEGIN
  IF COALESCE(p_admin_email, '') = '' THEN
    RAISE EXCEPTION 'admin email is required';
  END IF;

  SELECT *
  INTO commission_row
  FROM public.commissions
  WHERE id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission not found';
  END IF;

  SELECT id
  INTO first_commission_id
  FROM public.commissions
  WHERE partner_id = commission_row.partner_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF first_commission_id IS DISTINCT FROM commission_row.id THEN
    RAISE EXCEPTION 'only the first funded deal review can be cleared here';
  END IF;

  IF commission_row.first_funded_review_cleared THEN
    RETURN jsonb_build_object(
      'ok', true,
      'noOp', true,
      'payoutState', commission_row.payout_state,
      'message', 'First funded review was already cleared.'
    );
  END IF;

  UPDATE public.commissions
  SET first_funded_review_cleared = TRUE,
      updated_at = now()
  WHERE id = p_commission_id
  RETURNING *
  INTO commission_row;

  INSERT INTO public.commission_payout_audit (
    commission_id,
    admin_email,
    action,
    old_state,
    new_state,
    metadata
  )
  VALUES (
    p_commission_id,
    lower(p_admin_email),
    'first_funded_review_cleared',
    commission_row.payout_state,
    commission_row.payout_state,
    jsonb_build_object('firstFundedReviewCleared', true)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'payoutState', commission_row.payout_state,
    'message', 'First funded review cleared.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_commission_payout(
  p_commission_id BIGINT,
  p_next_state TEXT,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  commission_row public.commissions%ROWTYPE;
  old_state TEXT;
  first_commission_id BIGINT;
  is_first_funded BOOLEAN;
BEGIN
  IF COALESCE(p_admin_email, '') = '' THEN
    RAISE EXCEPTION 'admin email is required';
  END IF;

  IF p_next_state NOT IN ('authorized','paid') THEN
    RAISE EXCEPTION 'invalid payout transition';
  END IF;

  SELECT *
  INTO commission_row
  FROM public.commissions
  WHERE id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission not found';
  END IF;

  old_state := commission_row.payout_state;

  IF old_state = p_next_state THEN
    RETURN jsonb_build_object(
      'ok', true,
      'noOp', true,
      'payoutState', old_state,
      'message', 'Payout state was already applied.'
    );
  END IF;

  IF NOT (
    (old_state = 'accrued' AND p_next_state = 'authorized') OR
    (old_state = 'authorized' AND p_next_state = 'paid')
  ) THEN
    RAISE EXCEPTION 'cannot skip or reverse payout state';
  END IF;

  SELECT id
  INTO first_commission_id
  FROM public.commissions
  WHERE partner_id = commission_row.partner_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;
  is_first_funded := first_commission_id = commission_row.id;

  IF p_next_state = 'authorized'
    AND is_first_funded
    AND NOT commission_row.first_funded_review_cleared THEN
    RAISE EXCEPTION 'first funded review must be cleared before payout authorization';
  END IF;

  UPDATE public.commissions
  SET payout_state = p_next_state,
      payout_authorized_at = CASE
        WHEN p_next_state = 'authorized' THEN COALESCE(payout_authorized_at, now())
        ELSE payout_authorized_at
      END,
      payout_paid_at = CASE
        WHEN p_next_state = 'paid' THEN COALESCE(payout_paid_at, now())
        ELSE payout_paid_at
      END,
      updated_at = now()
  WHERE id = p_commission_id
  RETURNING *
  INTO commission_row;

  INSERT INTO public.commission_payout_audit (
    commission_id,
    admin_email,
    action,
    old_state,
    new_state,
    metadata
  )
  VALUES (
    p_commission_id,
    lower(p_admin_email),
    'payout_state_changed',
    old_state,
    p_next_state,
    jsonb_build_object('firstFunded', is_first_funded)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'payoutState', p_next_state,
    'message', 'Payout state advanced.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_commission_first_funded_review(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_commission_payout(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_commission_first_funded_review(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_commission_payout(BIGINT, TEXT, TEXT) TO service_role;

COMMIT;
