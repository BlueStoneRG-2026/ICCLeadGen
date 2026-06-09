import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/migrations/0001_phase_0_2_schema.sql", "utf8");
const idempotency = readFileSync("supabase/migrations/0002_commission_idempotency.sql", "utf8");
const atomicFunding = readFileSync("supabase/migrations/0003_atomic_funding_and_rpc_grants.sql", "utf8");
const outbox = readFileSync("supabase/migrations/0004_outbox_events.sql", "utf8");
const schemaEntrypoint = readFileSync("supabase/schema.sql", "utf8");

describe("Supabase schema invariants", () => {
  it("keeps partner, submission, and commission RLS scoped to auth.uid()", () => {
    expect(schema).toContain("USING (auth.uid() = id)");
    expect(schema).toContain("USING (auth.uid() = partner_id)");
    expect(schema).toMatch(/ALTER TABLE public\.partners ENABLE ROW LEVEL SECURITY;/);
    expect(schema).toMatch(/ALTER TABLE public\.submissions ENABLE ROW LEVEL SECURITY;/);
    expect(schema).toMatch(/ALTER TABLE public\.commissions ENABLE ROW LEVEL SECURITY;/);
    expect(schema).toMatch(/CREATE POLICY s_self ON public\.submissions\s+FOR SELECT\s+USING \(auth\.uid\(\) = partner_id\);/);
    expect(schema).toMatch(/CREATE POLICY c_self ON public\.commissions\s+FOR SELECT\s+USING \(auth\.uid\(\) = partner_id\);/);
  });

  it("keeps referral tokens immutable", () => {
    expect(schema).toContain("reject_referral_token_change");
    expect(schema).toContain("RAISE EXCEPTION 'referral_token is immutable'");
  });

  it("prevents duplicate non-renewal commissions while allowing renewals", () => {
    expect(idempotency).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_one_non_renewal_per_submission");
    expect(idempotency).toContain("ON public.commissions(submission_id)");
    expect(idempotency).toContain("WHERE is_renewal = false");
  });

  it("keeps funding state and commission accrual in one locked database transaction", () => {
    expect(atomicFunding).toContain("CREATE OR REPLACE FUNCTION public.mark_submission_funded");
    expect(atomicFunding).toContain("FOR UPDATE");
    expect(atomicFunding).toContain("INSERT INTO public.commissions");
    expect(atomicFunding).toContain("UPDATE public.submissions");
    expect(atomicFunding).toContain("WHEN unique_violation");
    expect(atomicFunding).toContain("REVOKE ALL ON FUNCTION public.mark_submission_funded(UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated");
    expect(atomicFunding).toContain("GRANT EXECUTE ON FUNCTION public.mark_submission_funded(UUID, NUMERIC, BOOLEAN) TO service_role");
  });

  it("locks shared RPCs down to service role and keeps the schema entrypoint complete", () => {
    expect(atomicFunding).toContain("REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated");
    expect(atomicFunding).toContain("GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) TO service_role");
    expect(schemaEntrypoint).toContain("0003_atomic_funding_and_rpc_grants.sql");
  });

  it("keeps the transactional outbox durable, bounded, and service-role-only", () => {
    expect(outbox).toContain("CREATE TABLE IF NOT EXISTS public.outbox_events");
    expect(outbox).toContain("event_key TEXT UNIQUE NOT NULL");
    expect(outbox).toContain("max_attempts INT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10)");
    expect(outbox).toContain("attempts < max_attempts");
    expect(outbox).toContain("CREATE OR REPLACE FUNCTION public.claim_outbox_event");
    expect(outbox).toContain("CREATE OR REPLACE FUNCTION public.mark_outbox_sent");
    expect(outbox).toContain("CREATE OR REPLACE FUNCTION public.mark_outbox_failed");
    expect(outbox).toContain("REVOKE ALL ON FUNCTION public.claim_outbox_event(UUID) FROM PUBLIC, anon, authenticated");
    expect(outbox).toContain("GRANT EXECUTE ON FUNCTION public.claim_outbox_event(UUID) TO service_role");
    expect(schemaEntrypoint).toContain("0004_outbox_events.sql");
  });
});
