import type { Handler } from "@netlify/functions";
import { handleFunctionError, requireAdmin, supabaseAdmin } from "./_shared/env";
import { jsonResponse } from "./_shared/http";

export const handler: Handler = async (event) => {
  try {
    await requireAdmin(event);
    const supabase = supabaseAdmin();

    const pending = await supabase
      .from("partners")
      .select("id,email,full_name,firm_name,status,created_at")
      .eq("status", "pending_manual_vetting")
      .order("created_at", { ascending: true });
    if (pending.error) {
      throw pending.error;
    }

    const queue = await supabase
      .from("submissions")
      .select("*, partners(email, full_name)")
      .in("routing_state", ["received", "va_check", "missing_docs"])
      .order("created_at", { ascending: true });
    if (queue.error) {
      throw queue.error;
    }

    const commissions = await supabase
      .from("commissions")
      .select("*, partners(email)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (commissions.error) {
      throw commissions.error;
    }

    return jsonResponse(200, {
      pendingPartners: (pending.data || []).map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        firmName: row.firm_name,
        status: row.status,
        createdAt: row.created_at
      })),
      queue: ((queue.data || []) as any[]).map((row) => ({
        id: row.id,
        merchantName: row.merchant_name,
        partnerEmail: row.partners?.email,
        partnerName: row.partners?.full_name,
        detectedDescriptor: row.detected_descriptor,
        checkerDecision: row.checker_decision,
        routingState: row.routing_state,
        createdAt: row.created_at
      })),
      commissions: ((commissions.data || []) as any[]).map((row) => ({
        id: String(row.id),
        submissionId: row.submission_id,
        partnerEmail: row.partners?.email,
        fundedAmount: Number(row.funded_amount),
        isRenewal: row.is_renewal,
        payoutOwed: Number(row.payout_owed),
        clawbackEligible: row.clawback_eligible,
        payoutState: row.payout_state,
        requiresFirstDealReview: row.payout_state === "accrued",
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    return handleFunctionError(error);
  }
};
