import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { runRulesOnlyChecker } from "./_shared/checker";
import { handleFunctionError, supabaseAdmin } from "./_shared/env";
import { sendTransactionalEmail, statusEmail } from "./_shared/email";
import { extractCheckerText, validateSubmissionFile } from "./_shared/file-validation";
import { getClientIp, jsonResponse, methodNotAllowed } from "./_shared/http";
import { parseMultipart } from "./_shared/multipart";
import { rateLimitPolicies } from "./_shared/abuse-policy";
import {
  partnerStatusForEmail,
  randomPassword,
  referralToken,
  ReferrerTypeSchema,
  safeFileName
} from "./_shared/partner";
import { enforceRateLimit } from "./_shared/rate-limit";
import { enforceSubmissionCaps } from "./_shared/submission-caps";

const IntakeSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  fullName: z.string().min(2),
  firmName: z.string().optional().default(""),
  merchantName: z.string().min(2),
  referrerType: ReferrerTypeSchema
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return methodNotAllowed();
  }

  try {
    const { fields, files } = await parseMultipart(event);
    const payload = IntakeSchema.parse(fields);
    const ip = getClientIp(event.headers);
    const supabase = supabaseAdmin();
    await enforceRateLimit(
      supabase,
      `${rateLimitPolicies.intakeIpHourly.keyPrefix}:${ip}`,
      rateLimitPolicies.intakeIpHourly.limit,
      rateLimitPolicies.intakeIpHourly.windowMs
    );
    await enforceRateLimit(
      supabase,
      `${rateLimitPolicies.intakeIpDaily.keyPrefix}:${ip}`,
      rateLimitPolicies.intakeIpDaily.limit,
      rateLimitPolicies.intakeIpDaily.windowMs
    );

    const statement = files.find((file) => file.fieldName === "statement");
    if (!statement) {
      throw Object.assign(new Error("A statement file is required."), { statusCode: 400 });
    }

    let partner = await findPartner(payload.email);
    if (!partner) {
      partner = await createPartner();
    }

    if (partner.status === "pending_manual_vetting") {
      return jsonResponse(202, {
        partnerStatus: "pending_manual_vetting",
        checkerDecision: "needs_review",
        routingState: "manual_vetting_required",
        message: "Manual vetting is required before this partner can submit files.",
        nextAction: "A VA approves the partner, then submissions open."
      });
    }

    if (partner.status === "suspended") {
      throw Object.assign(new Error("This partner account is suspended."), { statusCode: 403 });
    }

    await enforceSubmissionCaps(supabase, partner.id, partner.status);

    const validation = await validateSubmissionFile(statement.buffer, statement.mimeType);
    const checkerText = extractCheckerText(statement.buffer, validation.kind, statement.fileName);
    const checker = runRulesOnlyChecker({
      merchantName: payload.merchantName,
      fileName: statement.fileName,
      text: checkerText
    });
    const routingState = checker.checkerDecision === "out_of_box" ? "received" : "va_check";
    const bucket = process.env.SUBMISSION_BUCKET || "submission-files";
    const storagePath = `${partner.id}/${Date.now()}-${safeFileName(statement.fileName)}`;

    const upload = await supabase.storage.from(bucket).upload(storagePath, statement.buffer, {
      contentType: validation.mime,
      upsert: false
    });
    if (upload.error) {
      throw upload.error;
    }

    const { data: submission, error: insertError } = await supabase
      .from("submissions")
      .insert({
        partner_id: partner.id,
        referral_token: partner.referral_token,
        merchant_name: payload.merchantName,
        detected_descriptor: checker.detectedDescriptor,
        is_dominant_inflow: checker.isDominantInflow,
        checker_decision: checker.checkerDecision,
        file_path: storagePath,
        routing_state: routingState
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    await notifyPartner(partner.email, payload.merchantName, routingState);
    if (routingState === "va_check" && process.env.VA_QUEUE_EMAIL) {
      await sendTransactionalEmail({
        to: process.env.VA_QUEUE_EMAIL,
        subject: `ICC File Desk: ${payload.merchantName} ready for VA review`,
        text: `Submission ${submission.id} is ready. Descriptor: ${checker.detectedDescriptor}. File path: ${storagePath}`,
        html: `<p><strong>${payload.merchantName}</strong> is ready for VA review.</p><p>Descriptor: ${checker.detectedDescriptor}</p><p>File path: ${storagePath}</p>`
      });
    }

    return jsonResponse(200, {
      submissionId: submission.id,
      partnerStatus: partner.status,
      checkerDecision: checker.checkerDecision,
      routingState,
      detectedDescriptor: checker.detectedDescriptor,
      message:
        checker.checkerDecision === "likely_fundable"
          ? "Likely fundable. This one is worth submitting."
          : checker.checkerDecision === "needs_review"
            ? "Needs review. The VA queue has it."
            : "Out of box, but no hard rejection was made.",
      nextAction:
        routingState === "va_check"
          ? "The VA can route the package to underwriting."
          : "A friendly status email was sent and the file remains visible for review."
    });

    async function findPartner(email: string) {
      const { data, error } = await supabase.from("partners").select("*").eq("email", email).maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    }

    async function createPartner() {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: payload.email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: {
          full_name: payload.fullName,
          firm_name: payload.firmName,
          source: "rescue_challenge"
        }
      });
      if (authError || !authData.user) {
        throw authError || new Error("Supabase Auth user was not created.");
      }

      const token = referralToken(payload.firmName);
      const status = partnerStatusForEmail(payload.email);
      const { data, error } = await supabase
        .from("partners")
        .insert({
          id: authData.user.id,
          email: payload.email,
          full_name: payload.fullName,
          firm_name: payload.firmName || null,
          referrer_type: payload.referrerType,
          status,
          referral_token: token,
          commission_bps_new: 1100,
          commission_bps_renewal: 1100,
          pays_on_renewals: true
        })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return data;
    }

  } catch (error) {
    return handleFunctionError(error);
  }
};

async function notifyPartner(email: string, merchantName: string, routingState: string) {
  const content = statusEmail(routingState, merchantName);
  await sendTransactionalEmail({
    to: email,
    ...content
  });
}
