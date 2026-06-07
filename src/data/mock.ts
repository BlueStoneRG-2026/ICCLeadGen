import type { AdminData, CertificationResult, IntakeResult, PortalData } from "../types";

const genericDomains = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"]);

export function mockIntakeResult(formData: FormData): IntakeResult {
  const email = String(formData.get("email") || "");
  const merchantName = String(formData.get("merchantName") || "Amazon merchant");
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const file = formData.get("statement") as File | null;
  const text = `${merchantName} ${file?.name || ""}`.toLowerCase();
  const detectedDescriptor = text.includes("relay")
    ? "AMAZON RELAY"
    : text.includes("dsp")
      ? "AMAZON DSP"
      : "AMAZON.COM";

  if (genericDomains.has(domain)) {
    return {
      partnerStatus: "pending_manual_vetting",
      checkerDecision: "needs_review",
      routingState: "manual_vetting_required",
      detectedDescriptor,
      message: "Manual vetting needed before this file can move.",
      nextAction: "A VA approves the partner, then the file can be resubmitted."
    };
  }

  return {
    submissionId: "demo-sub-7f43",
    partnerStatus: "provisional",
    checkerDecision: "likely_fundable",
    routingState: "va_check",
    detectedDescriptor,
    message: "Likely fundable. This one is worth submitting.",
    nextAction: "The VA queue has the file package and can route it to underwriting."
  };
}

export function mockCertification(payload: Record<string, unknown>): CertificationResult {
  const email = String(payload.email || "partner@example.com");
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const status = genericDomains.has(domain) ? "pending_manual_vetting" : "provisional";

  return {
    partnerId: "demo-partner-8192",
    partnerStatus: status,
    signingUrl: "https://docuseal.example.com/s/icc-template-placeholder",
    referralToken: "ICC-DEMO-8192",
    message:
      status === "pending_manual_vetting"
        ? "Signup received. A VA must approve the partner before submissions open."
        : "Signup created. Send the partner to the DocuSeal signing URL."
  };
}

export const mockPortalData: PortalData = {
  partner: {
    fullName: "Avery Stone",
    firmName: "Stone Working Capital",
    status: "certified",
    referralToken: "ICC-STONE-42A9",
    rank: 7,
    commissionBpsNew: 1100,
    commissionBpsRenewal: 1100
  },
  submissions: [
    {
      id: "sub_001",
      merchantName: "Northstar FBA",
      detectedDescriptor: "AMAZON.COM",
      checkerDecision: "likely_fundable",
      routingState: "funded",
      createdAt: "2026-06-03T14:10:00Z"
    },
    {
      id: "sub_002",
      merchantName: "Prime Lane Relay",
      detectedDescriptor: "AMAZON RELAY",
      checkerDecision: "needs_review",
      routingState: "underwriting",
      createdAt: "2026-06-05T16:40:00Z"
    }
  ],
  commissions: [
    {
      id: "comm_001",
      submissionId: "sub_001",
      fundedAmount: 42000,
      isRenewal: false,
      payoutOwed: 4620,
      clawbackEligible: true,
      payoutState: "accrued",
      createdAt: "2026-06-06T12:00:00Z"
    }
  ]
};

export const mockAdminData: AdminData = {
  pendingPartners: [
    {
      id: "partner_pending",
      email: "broker.gmail@gmail.com",
      fullName: "Jordan Lee",
      firmName: "Lee Funding Desk",
      status: "pending_manual_vetting",
      createdAt: "2026-06-07T13:22:00Z"
    }
  ],
  queue: [
    {
      id: "sub_002",
      merchantName: "Prime Lane Relay",
      partnerEmail: "avery@stonewc.com",
      partnerName: "Avery Stone",
      detectedDescriptor: "AMAZON RELAY",
      checkerDecision: "needs_review",
      routingState: "va_check",
      createdAt: "2026-06-05T16:40:00Z"
    }
  ],
  commissions: [
    {
      id: "comm_001",
      submissionId: "sub_001",
      partnerEmail: "avery@stonewc.com",
      fundedAmount: 42000,
      isRenewal: false,
      payoutOwed: 4620,
      clawbackEligible: true,
      payoutState: "accrued",
      requiresFirstDealReview: true,
      createdAt: "2026-06-06T12:00:00Z"
    }
  ]
};
