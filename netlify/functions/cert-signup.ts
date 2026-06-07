import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { createPartnerAgreementEnvelope } from "./_shared/docuseal";
import { handleFunctionError, supabaseAdmin } from "./_shared/env";
import { sendTransactionalEmail } from "./_shared/email";
import { getClientIp, jsonResponse, methodNotAllowed } from "./_shared/http";
import { enforceRateLimit } from "./_shared/rate-limit";
import {
  emailDomain,
  partnerStatusForEmail,
  randomPassword,
  referralToken,
  ReferrerTypeSchema
} from "./_shared/partner";

const SignupSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  fullName: z.string().min(2),
  firmName: z.string().optional().default(""),
  referrerType: ReferrerTypeSchema,
  verificationUrl: z.string().url().optional().or(z.literal("")).default("")
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return methodNotAllowed();
  }

  try {
    const payload = SignupSchema.parse(JSON.parse(event.body || "{}"));
    const ip = getClientIp(event.headers);
    const supabase = supabaseAdmin();
    await enforceRateLimit(supabase, `cert-ip:${ip}`, 1, 60 * 60 * 1000);
    await enforceRateLimit(supabase, `cert-domain:${emailDomain(payload.email)}`, 1, 24 * 60 * 60 * 1000);
    const existing = await supabase
      .from("partners")
      .select("*")
      .eq("email", payload.email)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    const status = existing.data?.status || partnerStatusForEmail(payload.email);
    const token = existing.data?.referral_token || referralToken(payload.firmName);
    const userId = existing.data?.id || (await createAuthUser(payload.email, payload.fullName, payload.firmName));

    const envelope = await createPartnerAgreementEnvelope({
      email: payload.email,
      fullName: payload.fullName,
      firmName: payload.firmName,
      partnerId: userId,
      referralToken: token
    });

    const { error: upsertError } = await supabase.from("partners").upsert(
      {
        id: userId,
        email: payload.email,
        full_name: payload.fullName,
        firm_name: payload.firmName || null,
        referrer_type: payload.referrerType,
        verification_url: payload.verificationUrl || null,
        status,
        quiz_completed: true,
        referral_token: token,
        commission_bps_new: 1100,
        commission_bps_renewal: 1100,
        pays_on_renewals: true
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      throw upsertError;
    }

    await sendTransactionalEmail({
      to: payload.email,
      subject: "ICC Amazon File Desk: ISO agreement ready",
      text: `Your DocuSign agreement is ready: ${envelope.signingUrl}`,
      html: `<h1>Your ISO agreement is ready.</h1><p>The ICC Amazon File Desk created your DocuSign envelope. Open the signing session from the button below.</p><p><a href="${envelope.signingUrl}" style="background:#4b1217;border-radius:8px;color:#fffaf0;display:inline-block;font-weight:700;padding:13px 18px;text-decoration:none;">Open DocuSign</a></p>`
    });

    return jsonResponse(200, {
      partnerId: userId,
      partnerStatus: status,
      signingUrl: envelope.signingUrl,
      referralToken: token,
      message:
        status === "pending_manual_vetting"
          ? "Signup received. A VA must approve this partner before submissions open."
          : "Signup created. Send the partner to the DocuSign signing URL."
    });

    async function createAuthUser(email: string, fullName: string, firmName: string) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          firm_name: firmName,
          source: "cert_signup"
        }
      });
      if (error || !data.user) {
        throw error || new Error("Supabase Auth user was not created.");
      }
      return data.user.id;
    }
  } catch (error) {
    return handleFunctionError(error);
  }
};
