import { describe, expect, it } from "vitest";
import { rateLimitPolicies } from "../netlify/functions/_shared/abuse-policy";
import { enforceRateLimit } from "../netlify/functions/_shared/rate-limit";
import { enforceSubmissionCaps } from "../netlify/functions/_shared/submission-caps";
import { partnerStatusForEmail } from "../netlify/functions/_shared/partner";
import { sequenceSupabase } from "./helpers/fakeSupabase";

describe("abuse throttles", () => {
  it("documents signup and intake shared rate-limit policies", () => {
    expect(rateLimitPolicies.certSignupIp).toMatchObject({ keyPrefix: "cert-ip", limit: 1 });
    expect(rateLimitPolicies.certSignupDomain).toMatchObject({ keyPrefix: "cert-domain", limit: 1 });
    expect(rateLimitPolicies.intakeIpHourly).toMatchObject({ keyPrefix: "intake-ip-hour", limit: 5 });
    expect(rateLimitPolicies.intakeIpDaily).toMatchObject({ keyPrefix: "intake-ip-day", limit: 10 });
  });

  it("throws 429 when Supabase-backed rate limits are consumed", async () => {
    const supabase = { rpc: async () => ({ data: false, error: null }) };

    await expect(enforceRateLimit(supabase as any, "intake-ip-hour:127.0.0.1", 5, 60_000)).rejects.toMatchObject({
      statusCode: 429
    });
  });

  it("enforces one submission until certified", async () => {
    const supabase = sequenceSupabase([
      { count: 0, error: null },
      { count: 1, error: null }
    ]);

    await expect(
      enforceSubmissionCaps(supabase, "partner-1", "provisional", new Date("2026-01-01T00:00:00Z"))
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("enforces a three-per-day upload cap", async () => {
    const supabase = sequenceSupabase([{ count: 3, error: null }]);

    await expect(
      enforceSubmissionCaps(supabase, "partner-1", "certified", new Date("2026-01-01T00:00:00Z"))
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe("partner status routing", () => {
  it("routes generic emails to pending_manual_vetting", () => {
    expect(partnerStatusForEmail("broker@gmail.com")).toBe("pending_manual_vetting");
  });

  it("routes corporate emails to provisional", () => {
    expect(partnerStatusForEmail("ops@seriousbrokerage.com")).toBe("provisional");
  });
});

