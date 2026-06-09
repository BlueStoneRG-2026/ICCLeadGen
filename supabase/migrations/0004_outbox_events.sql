-- Lightweight transactional email/event outbox.

BEGIN;

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transactional_email'
    CHECK (kind IN ('transactional_email')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','sent','failed','dead')),
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_next
  ON public.outbox_events(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_updated
  ON public.outbox_events(updated_at DESC);

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_outbox_event(p_id UUID)
RETURNS public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.outbox_events%ROWTYPE;
BEGIN
  UPDATE public.outbox_events
  SET status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      updated_at = now(),
      last_error = NULL
  WHERE id = p_id
    AND status IN ('queued','failed')
    AND next_attempt_at <= now()
    AND attempts < max_attempts
  RETURNING *
  INTO claimed;

  RETURN claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_sent(p_id UUID)
RETURNS public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.outbox_events%ROWTYPE;
BEGIN
  UPDATE public.outbox_events
  SET status = 'sent',
      sent_at = COALESCE(sent_at, now()),
      locked_at = NULL,
      updated_at = now(),
      last_error = NULL
  WHERE id = p_id
    AND status = 'processing'
  RETURNING *
  INTO updated;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_failed(p_id UUID, p_error TEXT)
RETURNS public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.outbox_events%ROWTYPE;
BEGIN
  UPDATE public.outbox_events
  SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed' END,
      next_attempt_at = now() + LEAST((POWER(2, attempts)::INT), 60) * INTERVAL '1 minute',
      locked_at = NULL,
      updated_at = now(),
      last_error = LEFT(COALESCE(p_error, 'send failed'), 240)
  WHERE id = p_id
    AND status = 'processing'
  RETURNING *
  INTO updated;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox_event(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_outbox_sent(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_outbox_failed(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_event(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_sent(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_failed(UUID, TEXT) TO service_role;

COMMIT;
