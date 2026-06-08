import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateCommission } from "../netlify/functions/_shared/commission";
import {
  duplicateNonRenewalMessages,
  isUniqueViolation,
  nonRenewalDuplicateMessage
} from "../netlify/functions/_shared/funded-idempotency";
import { sequenceSupabase } from "./helpers/fakeSupabase";

describe("commission math", () => {
  it("uses new-deal basis points and rounds to cents", () => {
    expect(
      calculateCommission({
        fundedAmount: 12345.67,
        commissionBpsNew: 1100,
        commissionBpsRenewal: 1200,
        isRenewal: false
      })
    ).toEqual({
      bps: 1100,
      payoutOwed: 1358.02,
      clawbackEligible: true
    });
  });

  it("uses renewal basis points and does not mark clawback at exactly 10000", () => {
    expect(
      calculateCommission({
        fundedAmount: 10000,
        commissionBpsNew: 1000,
        commissionBpsRenewal: 1200,
        isRenewal: true
      })
    ).toEqual({
      bps: 1200,
      payoutOwed: 1200,
      clawbackEligible: false
    });
  });
});

describe("funded idempotency guard", () => {
  it("blocks duplicate non-renewal accrual when a submission is already funded", async () => {
    const supabase = sequenceSupabase([]);

    await expect(nonRenewalDuplicateMessage(supabase, { routing_state: "funded" }, "sub-1")).resolves.toBe(
      duplicateNonRenewalMessages.alreadyFunded
    );
    expect(supabase.calls).toEqual([]);
  });

  it("blocks duplicate non-renewal accrual when a non-renewal commission already exists", async () => {
    const supabase = sequenceSupabase([{ count: 1, error: null }]);

    await expect(nonRenewalDuplicateMessage(supabase, { routing_state: "underwriting" }, "sub-1")).resolves.toBe(
      duplicateNonRenewalMessages.commissionExists
    );
    expect(supabase.calls).toEqual(["commissions"]);
  });

  it("allows first-time non-renewal and keeps renewals repeatable through schema scope", async () => {
    const supabase = sequenceSupabase([{ count: 0, error: null }]);

    await expect(nonRenewalDuplicateMessage(supabase, { routing_state: "underwriting" }, "sub-1")).resolves.toBe("");
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "PGRST116" })).toBe(false);
  });
});

describe("admin funded action", () => {
  it("uses the atomic database RPC instead of separate update/insert calls", () => {
    const source = readFileSync("netlify/functions/admin-action.ts", "utf8");
    expect(source).toContain('supabase.rpc("mark_submission_funded"');
    expect(source).not.toContain(".from(\"commissions\").insert");
    expect(source).not.toContain(".update({ routing_state: \"funded\"");
  });
});
