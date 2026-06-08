import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { env, handleFunctionError, requireAdmin, supabaseAdmin } from "./_shared/env";
import { certifiedPartnerEmail, sendTransactionalEmail, statusEmail } from "./_shared/email";
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
    action: z.literal("resend_certified_email"),
    partnerId: z.string().uuid()
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

    if (payload.action === "resend_certified_email") {
      const partner = await fetchCertifiedPartner(payload.partnerId);
      await sendTransactionalEmail({
        to: partner.email,
        ...certifiedPartnerEmail(partner.full_name, partner.referral_token)
      });
      return jsonResponse(200, { ok: true, message: "Certified partner email re-sent." });
    }

    const submission = await fetchSubmission(payload.submissionId);
    const partner = submission.partner;
    const funding = await supabase.rpc("mark_submission_funded", {
      p_submission_id: payload.submissionId,
      p_funded_amount: payload.fundedAmount,
      p_is_renewal: payload.isRenewal
    });
    if (funding.error) {
      throw funding.error;
    }

    const fundingResult = funding.data as {
      bps?: number;
      firstDeal?: boolean;
      message?: string;
      noOp?: boolean;
    };
    if (fundingResult.noOp) {
      return jsonResponse(200, { ok: true, message: fundingResult.message });
    }

    await notifyPartner(partner.email, submission.merchant_name, "funded");
    return jsonResponse(200, {
      ok: true,
      message: fundingResult.firstDeal
        ? `Commission accrued at ${(fundingResult.bps || 0) / 100}%. First funded deal requires manual review before payout authorization.`
        : `Commission accrued at ${(fundingResult.bps || 0) / 100}%.`
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

    async function fetchCertifiedPartner(partnerId: string) {
      const { data, error } = await supabase
        .from("partners")
        .select("email,full_name,referral_token,status")
        .eq("id", partnerId)
        .single();
      if (error) {
        throw error;
      }
      if (data.status !== "certified") {
        throw Object.assign(new Error("Certified email can only be re-sent to certified partners."), {
          statusCode: 422
        });
      }
      return data;
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
  try {
    await sendTransactionalEmail({
      to: email,
      ...content
    });
  } catch (error) {
    console.warn("Partner status email failed after durable admin action.", {
      routingState,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
