export type CheckerDecision = "likely_fundable" | "needs_review" | "out_of_box";

export type PartnerStatus =
  | "pending_manual_vetting"
  | "provisional"
  | "certified"
  | "suspended";

export type RoutingState =
  | "received"
  | "under_review"
  | "missing_docs"
  | "va_check"
  | "underwriting"
  | "approved"
  | "declined"
  | "funded";

export interface IntakeResult {
  submissionId?: string;
  partnerStatus: PartnerStatus;
  checkerDecision: CheckerDecision;
  routingState: RoutingState | "manual_vetting_required";
  detectedDescriptor?: string;
  message: string;
  nextAction: string;
}

export interface CertificationResult {
  partnerId: string;
  partnerStatus: PartnerStatus;
  signingUrl: string;
  referralToken: string;
  message: string;
}

export interface SubmissionRow {
  id: string;
  merchantName: string;
  detectedDescriptor: string;
  checkerDecision: CheckerDecision;
  routingState: RoutingState;
  createdAt: string;
}

export interface CommissionRow {
  id: string;
  submissionId: string;
  fundedAmount: number;
  isRenewal: boolean;
  payoutOwed: number;
  clawbackEligible: boolean;
  payoutState: "accrued" | "authorized" | "paid";
  createdAt: string;
}

export interface PortalData {
  partner: {
    fullName: string;
    firmName?: string;
    status: PartnerStatus;
    referralToken: string;
    rank: number;
    commissionBpsNew: number;
    commissionBpsRenewal: number;
  };
  submissions: SubmissionRow[];
  commissions: CommissionRow[];
}

export interface AdminData {
  pendingPartners: Array<{
    id: string;
    email: string;
    fullName: string;
    firmName?: string;
    status: PartnerStatus;
    createdAt: string;
  }>;
  certifiedPartners: Array<{
    id: string;
    email: string;
    fullName: string;
    firmName?: string;
    status: PartnerStatus;
    referralToken: string;
    createdAt: string;
  }>;
  queue: Array<SubmissionRow & { partnerEmail: string; partnerName: string }>;
  commissions: Array<CommissionRow & { partnerEmail: string; requiresFirstDealReview: boolean }>;
}
