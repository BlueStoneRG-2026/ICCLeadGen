import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/migrations/0001_phase_0_2_schema.sql", "utf8");
const idempotency = readFileSync("supabase/migrations/0002_commission_idempotency.sql", "utf8");

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
});
