-- Local-only cleanup for seed and smoke-flow records.
-- Prefer `supabase db reset` for a full clean local database.

BEGIN;

DELETE FROM public.commissions
WHERE partner_id IN (
  SELECT id
  FROM public.partners
  WHERE email LIKE '%@filedesk.local' OR email LIKE '%@examplebroker.test'
);

DELETE FROM public.submissions
WHERE partner_id IN (
  SELECT id
  FROM public.partners
  WHERE email LIKE '%@filedesk.local' OR email LIKE '%@examplebroker.test'
);

DELETE FROM storage.objects
WHERE bucket_id = 'submission-files'
  AND (name LIKE '22222222-2222-4222-8222-222222222222/%'
    OR name LIKE '33333333-3333-4333-8333-333333333333/%'
    OR name LIKE '%local-amazon-%');

DELETE FROM public.partners
WHERE email LIKE '%@filedesk.local' OR email LIKE '%@examplebroker.test';

DELETE FROM auth.users
WHERE email LIKE '%@filedesk.local' OR email LIKE '%@examplebroker.test';

DELETE FROM public.rate_limits;

COMMIT;
