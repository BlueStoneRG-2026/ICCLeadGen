import type { Handler } from "@netlify/functions";
import { handleFunctionError, requireUser, supabaseAdmin } from "./_shared/env";
import { jsonResponse } from "./_shared/http";

export const handler: Handler = async (event) => {
  try {
    const user = await requireUser(event);
    const supabase = supabaseAdmin();

    const partnerResult = await supabase.from("partners").select("*").eq("id", user.id).single();
    if (partnerResult.error) {
      throw partnerResult.error;
    }
    const partner = partnerResult.data;

    const submissionsResult = await supabase
      .from("submissions")
      .select("*")
      .eq("partner_id", user.id)
      .order("created_at", { ascending: false });
    if (submissionsResult.error) {
      throw submissionsResult.error;
    }

    const commissionsResult = await supabase
      .from("commissions")
      .select("*")
      .eq("partner_id", user.id)
      .order("created_at", { ascending: false });
    if (commissionsResult.error) {
      throw commissionsResult.error;
    }

    const allCommissions = await supabase.from("commissions").select("partner_id,payout_owed");
    if (allCommissions.error) {
      throw allCommissions.error;
    }
    const rank = computePrivateRank(user.id, allCommissions.data || []);

    return jsonResponse(200, {
      partner: {
        fullName: partner.full_name,
        firmName: partner.firm_name,
        status: partner.status,
        referralToken: partner.referral_token,
        rank,
        commissionBpsNew: partner.commission_bps_new,
        commissionBpsRenewal: partner.commission_bps_renewal
      },
      submissions: (submissionsResult.data || []).map((row) => ({
        id: row.id,
        merchantName: row.merchant_name,
        detectedDescriptor: row.detected_descriptor,
        checkerDecision: row.checker_decision,
        routingState: row.routing_state,
        createdAt: row.created_at
      })),
      commissions: (commissionsResult.data || []).map((row) => ({
        id: String(row.id),
        submissionId: row.submission_id,
        fundedAmount: Number(row.funded_amount),
        isRenewal: row.is_renewal,
        payoutOwed: Number(row.payout_owed),
        clawbackEligible: row.clawback_eligible,
        payoutState: row.payout_state,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    return handleFunctionError(error);
  }
};

function computePrivateRank(partnerId: string, rows: Array<{ partner_id: string; payout_owed: number | string }>) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    totals.set(row.partner_id, (totals.get(row.partner_id) || 0) + Number(row.payout_owed));
  });
  const own = totals.get(partnerId) || 0;
  const ahead = [...totals.values()].filter((total) => total > own).length;
  return ahead + 1;
}
