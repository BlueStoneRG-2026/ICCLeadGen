-- Track in-flight partner e-sign envelopes so retries reuse active DocuSign envelopes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_esign_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'docusign'
    CHECK (provider IN ('docusign')),
  envelope_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('created','sent','delivered','completed','declined','voided','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_esign_envelopes_partner_active
  ON public.partner_esign_envelopes(partner_id, updated_at DESC)
  WHERE status IN ('created','sent','delivered');

ALTER TABLE public.partner_esign_envelopes ENABLE ROW LEVEL SECURITY;

COMMIT;
