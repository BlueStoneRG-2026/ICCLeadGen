import type { Handler } from "@netlify/functions";
import { handleFunctionError, requireAdmin, supabaseAdmin } from "./_shared/env";
import { handleCorsPreflight, jsonResponse, methodNotAllowed } from "./_shared/http";

export const handler: Handler = async (event) => {
  const cors = handleCorsPreflight(event);
  if (cors) return cors;

  if (event.httpMethod !== "GET") {
    return methodNotAllowed();
  }

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

    const certified = await supabase
      .from("partners")
      .select("id,email,full_name,firm_name,status,referral_token,created_at")
      .eq("status", "certified")
      .order("created_at", { ascending: false })
      .limit(50);
    if (certified.error) {
      throw certified.error;
    }

    const queue = await supabase
      .from("submissions")
      .select("*, partners(email, full_name)")
      .in("routing_state", ["received", "va_check", "missing_docs", "underwriting"])
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

    const outbox = await supabase
      .from("outbox_events")
      .select("id,event_key,status,template,to_email,attempts,max_attempts,next_attempt_at,last_error,updated_at")
      .in("status", ["queued", "failed", "dead"])
      .order("updated_at", { ascending: false })
      .limit(50);
    if (outbox.error) {
      throw outbox.error;
    }

    const commissionRows = (commissions.data || []) as any[];
    const firstCommissionByPartner = new Map<string, string>();
    [...commissionRows]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .forEach((row) => {
        if (!firstCommissionByPartner.has(row.partner_id)) {
          firstCommissionByPartner.set(row.partner_id, String(row.id));
        }
      });

    return jsonResponse(200, {
      pendingPartners: (pending.data || []).map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        firmName: row.firm_name,
        status: row.status,
        createdAt: row.created_at
      })),
      certifiedPartners: (certified.data || []).map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        firmName: row.firm_name,
        status: row.status,
        referralToken: row.referral_token,
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
      commissions: commissionRows.map((row) => ({
        id: String(row.id),
        submissionId: row.submission_id,
        partnerEmail: row.partners?.email,
        fundedAmount: Number(row.funded_amount),
        isRenewal: row.is_renewal,
        payoutOwed: Number(row.payout_owed),
        clawbackEligible: row.clawback_eligible,
        payoutState: row.payout_state,
        requiresFirstDealReview:
          row.payout_state === "accrued" && firstCommissionByPartner.get(row.partner_id) === String(row.id),
        createdAt: row.created_at
      })),
      outboxEvents: (outbox.data || []).map((row) => ({
        id: row.id,
        eventKey: row.event_key,
        status: row.status,
        template: row.template,
        toEmail: row.to_email,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    return handleFunctionError(error);
  }
};
