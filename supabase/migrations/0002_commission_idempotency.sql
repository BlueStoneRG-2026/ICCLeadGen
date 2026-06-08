-- Prevent duplicate non-renewal commission accruals for the same submission.
-- Renewals intentionally remain repeatable.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_one_non_renewal_per_submission
ON public.commissions(submission_id)
WHERE is_renewal = false;

COMMIT;
