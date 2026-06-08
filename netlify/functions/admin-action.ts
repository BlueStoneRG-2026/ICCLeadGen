import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { env, handleFunctionError, requireAdmin, supabaseAdmin } from "./_shared/env";
import { sendTransactionalEmail, statusEmail } from "./_shared/email";
import { calculateCommission } from "./_shared/commission";
import { duplicateNonRenewalMessages, isUniqueViolation, nonRenewalDuplicateMessage } from "./_shared/funded-idempotency";
import { handleCorsPreflight, jsonResponse, methodNotAllowed } from "./_shared/http";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve_partner"),
    partnerId: z.string().uuid()
  }),
  z.object({
    action: z.literal("send_to_underwriting"),
    submissionId: z.string().uuid()
  }),
  z.object({
    action: z.literal("mark_funded"),
    submissionId: z.string().uuid(),
    fundedAmount: z.coerce.number().positive(),
    isRenewal: z.coerce.boolean().default(false)
  })
]);

export const handler: Handler = async (event) => {
  const cors = handleCorsPreflight(event);
  if (cors) return cors;

  if (event.httpMethod !== "POST") {
    return methodNotAllowed();
  }

  try {
    await requireAdmin(event);
    const payload = ActionSchema.parse(JSON.parse(event.body || "{}"));
    const supabase = supabaseAdmin();

    if (payload.action === "approve_partner") {
      const partner = await supabase
        .from("partners")
        .select("esign_envelope_id")
        .eq("id", payload.partnerId)
        .single();
      if (partner.error) {
        throw partner.error;
      }
      const nextStatus = partner.data.esign_envelope_id ? "certified" : "provisional";
      const { error } = await supabase
        .from("partners")
        .update({ status: nextStatus })
        .eq("id", payload.partnerId)
        .eq("status", "pending_manual_vetting");
      if (error) {
        throw error;
      }
      return jsonResponse(200, { ok: true, message: `Partner approved and moved to ${nextStatus}.` });
    }

    if (payload.action === "send_to_underwriting") {
      const submission = await fetchSubmission(payload.submissionId);
      const { error } = await supabase
        .from("submissions")
        .update({ routing_state: "underwriting", updated_at: new Date().toISOString() })
        .eq("id", payload.submissionId);
      if (error) {
        throw error;
      }

      await sendUnderwritingPackage(submission);
      await notifyPartner(submission.partner.email, submission.merchant_name, "underwriting");
      return jsonResponse(200, {
        ok: true,
        message: "Submission marked underwriting and intake package sent."
      });
    }

    const submission = await fetchSubmission(payload.submissionId);
    const partner = submission.partner;
    if (!payload.isRenewal) {
      const noOpMessage = await nonRenewalDuplicateMessage(supabase, submission, payload.submissionId);
      if (noOpMessage) {
        return jsonResponse(200, { ok: true, message: noOpMessage });
      }
    }

    const { bps, payoutOwed, clawbackEligible } = calculateCommission({
      fundedAmount: payload.fundedAmount,
      commissionBpsNew: partner.commission_bps_new,
      commissionBpsRenewal: partner.commission_bps_renewal,
      isRenewal: payload.isRenewal
    });
    const firstDeal = await isFirstFundedDeal(partner.id);

    const update = await supabase
      .from("submissions")
      .update({ routing_state: "funded", updated_at: new Date().toISOString() })
      .eq("id", payload.submissionId);
    if (update.error) {
      throw update.error;
    }

    const insert = await supabase.from("commissions").insert({
      partner_id: partner.id,
      submission_id: payload.submissionId,
      funded_amount: payload.fundedAmount,
      is_renewal: payload.isRenewal,
      payout_owed: payoutOwed,
      clawback_eligible: clawbackEligible,
      payout_state: "accrued"
    });
    if (insert.error) {
      if (!payload.isRenewal && isUniqueViolation(insert.error)) {
        return jsonResponse(200, {
          ok: true,
          message: duplicateNonRenewalMessages.commissionExists
        });
      }
      throw insert.error;
    }

    await notifyPartner(partner.email, submission.merchant_name, "funded");
    return jsonResponse(200, {
      ok: true,
      message: firstDeal
        ? `Commission accrued at ${bps / 100}%. First funded deal requires manual review before payout authorization.`
        : `Commission accrued at ${bps / 100}%.`
    });

    async function fetchSubmission(submissionId: string) {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, partners(*)")
        .eq("id", submissionId)
        .single();
      if (error) {
        throw error;
      }
      return {
        ...data,
        partner: (data as any).partners
      } as any;
    }

    async function isFirstFundedDeal(partnerId: string) {
      const { count, error } = await supabase
        .from("commissions")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId);
      if (error) {
        throw error;
      }
      return (count || 0) === 0;
    }

  } catch (error) {
    return handleFunctionError(error);
  }
};

async function sendUnderwritingPackage(submission: any) {
  const intakeEmail = env("UNDERWRITING_INTAKE_EMAIL");
  if (!intakeEmail) {
    console.info("UNDERWRITING_INTAKE_EMAIL missing; package logged only.", submission.id);
    return;
  }

  await sendTransactionalEmail({
    to: intakeEmail,
    subject: `ICC underwriting intake: ${submission.merchant_name}`,
    text: [
      `Merchant: ${submission.merchant_name}`,
      `Partner: ${submission.partner.full_name} <${submission.partner.email}>`,
      `Descriptor: ${submission.detected_descriptor}`,
      `Decision: ${submission.checker_decision}`,
      `File path: ${submission.file_path}`
    ].join("\n"),
    html: `<p><strong>${submission.merchant_name}</strong></p><ul><li>Partner: ${submission.partner.full_name} &lt;${submission.partner.email}&gt;</li><li>Descriptor: ${submission.detected_descriptor}</li><li>Decision: ${submission.checker_decision}</li><li>File path: ${submission.file_path}</li></ul>`
  });
}

async function notifyPartner(email: string, merchantName: string, routingState: string) {
  const content = statusEmail(routingState, merchantName);
  await sendTransactionalEmail({
    to: email,
    ...content
  });
}
