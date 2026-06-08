import type { AdminData } from "../types";

export function applyDemoAdminAction(data: AdminData | null, action: string, payload: Record<string, unknown>) {
  if (!data) {
    return data;
  }

  if (action === "approve_partner") {
    return {
      ...data,
      pendingPartners: data.pendingPartners.filter((partner) => partner.id !== payload.partnerId)
    };
  }

  if (action === "send_to_underwriting") {
    return {
      ...data,
      queue: data.queue.map((submission) =>
        submission.id === payload.submissionId ? { ...submission, routingState: "underwriting" as const } : submission
      )
    };
  }

  if (action === "mark_funded") {
    const submission = data.queue.find((row) => row.id === payload.submissionId);
    if (!submission) {
      return data;
    }
    const fundedAmount = Number(payload.fundedAmount || 0);
    const isRenewal = Boolean(payload.isRenewal);
    const payoutOwed = Math.round(fundedAmount * 0.11 * 100) / 100;
    const partnerHasCommission = data.commissions.some((row) => row.partnerEmail === submission.partnerEmail);

    return {
      ...data,
      queue: data.queue.filter((row) => row.id !== payload.submissionId),
      commissions: [
        {
          id: `demo_${submission.id}`,
          submissionId: submission.id,
          partnerEmail: submission.partnerEmail,
          fundedAmount,
          isRenewal,
          payoutOwed,
          clawbackEligible: fundedAmount > 10000,
          payoutState: "accrued" as const,
          requiresFirstDealReview: !partnerHasCommission,
          createdAt: new Date().toISOString()
        },
        ...data.commissions
      ]
    };
  }

  return data;
}
