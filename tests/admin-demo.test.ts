import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { applyDemoAdminAction } from "../src/lib/admin-demo";
import type { AdminData } from "../src/types";

const baseData: AdminData = {
  pendingPartners: [
    {
      id: "pending-1",
      email: "broker@gmail.com",
      fullName: "Pending Broker",
      firmName: "Pending Desk",
      status: "pending_manual_vetting",
      createdAt: "2026-06-01T00:00:00Z"
    }
  ],
  certifiedPartners: [
    {
      id: "certified-1",
      email: "certified@agency.test",
      fullName: "Certified Partner",
      firmName: "Certified Desk",
      status: "certified",
      referralToken: "ICC-CERT-1",
      createdAt: "2026-06-01T00:00:00Z"
    }
  ],
  queue: [
    {
      id: "sub-first",
      merchantName: "First Seller",
      partnerEmail: "new@agency.test",
      partnerName: "New Partner",
      detectedDescriptor: "AMAZON.COM",
      checkerDecision: "likely_fundable",
      routingState: "va_check",
      createdAt: "2026-06-01T00:00:00Z"
    },
    {
      id: "sub-repeat",
      merchantName: "Repeat Seller",
      partnerEmail: "seasoned@agency.test",
      partnerName: "Seasoned Partner",
      detectedDescriptor: "AMAZON RELAY",
      checkerDecision: "needs_review",
      routingState: "va_check",
      createdAt: "2026-06-02T00:00:00Z"
    }
  ],
  commissions: [
    {
      id: "comm-existing",
      submissionId: "sub-old",
      partnerEmail: "seasoned@agency.test",
      fundedAmount: 20000,
      isRenewal: false,
      payoutOwed: 2200,
      clawbackEligible: true,
      payoutState: "accrued",
      requiresFirstDealReview: true,
      createdAt: "2026-05-01T00:00:00Z"
    }
  ]
};

describe("demo admin daily loop", () => {
  it("approves pending partners in demo mode", () => {
    const next = applyDemoAdminAction(baseData, "approve_partner", { partnerId: "pending-1" });
    expect(next?.pendingPartners).toEqual([]);
  });

  it("keeps underwriting submissions visible for mark-funded", () => {
    const next = applyDemoAdminAction(baseData, "send_to_underwriting", { submissionId: "sub-first" });
    expect(next?.queue.find((row) => row.id === "sub-first")?.routingState).toBe("underwriting");
  });

  it("marks funded, calculates commission, and flags first funded partner review", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T12:00:00Z"));
    const next = applyDemoAdminAction(baseData, "mark_funded", {
      submissionId: "sub-first",
      fundedAmount: 25000,
      isRenewal: false
    });

    expect(next?.queue.some((row) => row.id === "sub-first")).toBe(false);
    expect(next?.commissions[0]).toMatchObject({
      submissionId: "sub-first",
      fundedAmount: 25000,
      payoutOwed: 2750,
      clawbackEligible: true,
      requiresFirstDealReview: true
    });
    vi.useRealTimers();
  });

  it("does not flag first-deal review when the partner already has a commission", () => {
    const next = applyDemoAdminAction(baseData, "mark_funded", {
      submissionId: "sub-repeat",
      fundedAmount: 9000,
      isRenewal: true
    });

    expect(next?.commissions[0]).toMatchObject({
      submissionId: "sub-repeat",
      payoutOwed: 990,
      clawbackEligible: false,
      requiresFirstDealReview: false
    });
  });

  it("leaves demo data intact after resending a certified email", () => {
    const next = applyDemoAdminAction(baseData, "resend_certified_email", { partnerId: "certified-1" });
    expect(next?.certifiedPartners).toEqual(baseData.certifiedPartners);
    expect(next?.pendingPartners).toEqual(baseData.pendingPartners);
  });
});

describe("live admin endpoint guardrails", () => {
  it("keeps admin endpoints allowlist-gated and underwriting visible in the queue", () => {
    const dataSource = readFileSync("netlify/functions/admin-data.ts", "utf8");
    const actionSource = readFileSync("netlify/functions/admin-action.ts", "utf8");

    expect(dataSource).toContain("await requireAdmin(event)");
    expect(actionSource).toContain("await requireAdmin(event)");
    expect(dataSource).toContain("\"underwriting\"");
    expect(dataSource).toContain("firstCommissionByPartner");
  });

  it("keeps certified email resend allowlist-gated and branded", () => {
    const dataSource = readFileSync("netlify/functions/admin-data.ts", "utf8");
    const actionSource = readFileSync("netlify/functions/admin-action.ts", "utf8");

    expect(dataSource).toContain("certifiedPartners");
    expect(actionSource).toContain('z.literal("resend_certified_email")');
    expect(actionSource).toContain("certifiedPartnerEmail");
    expect(actionSource).toContain('data.status !== "certified"');
  });
});
