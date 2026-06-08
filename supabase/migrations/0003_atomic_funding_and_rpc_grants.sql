-- Atomic funding/commission transition and RPC hardening.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_submission_funded(
  p_submission_id UUID,
  p_funded_amount NUMERIC,
  p_is_renewal BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked_submission public.submissions%ROWTYPE;
  partner_row public.partners%ROWTYPE;
  commission_bps INT;
  payout NUMERIC(12,2);
  clawback BOOLEAN;
  first_deal BOOLEAN;
  existing_non_renewal_count INT;
BEGIN
  IF p_funded_amount <= 0 THEN
    RAISE EXCEPTION 'funded amount must be positive';
  END IF;

  SELECT *
  INTO locked_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission not found';
  END IF;

  SELECT *
  INTO partner_row
  FROM public.partners
  WHERE id = locked_submission.partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner not found';
  END IF;

  IF NOT p_is_renewal THEN
    SELECT COUNT(*)
    INTO existing_non_renewal_count
    FROM public.commissions
    WHERE submission_id = p_submission_id
      AND is_renewal = false;

    IF locked_submission.routing_state = 'funded' OR existing_non_renewal_count > 0 THEN
      RETURN jsonb_build_object(
        'inserted', false,
        'noOp', true,
        'message', 'A non-renewal commission already exists for this submission. No duplicate was accrued.'
      );
    END IF;
  END IF;

  commission_bps := CASE
    WHEN p_is_renewal THEN partner_row.commission_bps_renewal
    ELSE partner_row.commission_bps_new
  END;
  payout := round(p_funded_amount * commission_bps / 10000, 2);
  clawback := p_funded_amount > 10000;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.commissions
    WHERE partner_id = partner_row.id
  )
  INTO first_deal;

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
    partner_row.id,
    p_submission_id,
    p_funded_amount,
    p_is_renewal,
    payout,
    clawback,
    'accrued'
  );

  UPDATE public.submissions
  SET routing_state = 'funded',
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'inserted', true,
    'noOp', false,
    'bps', commission_bps,
    'payoutOwed', payout,
    'clawbackEligible', clawback,
    'firstDeal', first_deal,
    'message', CASE
      WHEN first_deal THEN 'First funded deal requires manual review before payout authorization.'
      ELSE 'Commission accrued.'
    END
  );
EXCEPTION
  WHEN unique_violation THEN
    IF NOT p_is_renewal THEN
      RETURN jsonb_build_object(
        'inserted', false,
        'noOp', true,
        'message', 'A non-renewal commission already exists for this submission. No duplicate was accrued.'
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.mark_submission_funded(UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_submission_funded(UUID, NUMERIC, BOOLEAN) TO service_role;

COMMIT;
