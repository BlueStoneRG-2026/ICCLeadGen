import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { createPartnerAgreementEnvelope } from "./_shared/docusign";
import { env, handleFunctionError, supabaseAdmin } from "./_shared/env";
import { isoReadyEmail, isoReadyEmailEventKey, sendTransactionalEmail } from "./_shared/email";
import { getClientIp, handleCorsPreflight, jsonResponse, methodNotAllowed } from "./_shared/http";
import { enforceRateLimit } from "./_shared/rate-limit";
import { rateLimitPolicies } from "./_shared/abuse-policy";
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
  const cors = handleCorsPreflight(event);
  if (cors) return cors;

  if (event.httpMethod !== "POST") {
    return methodNotAllowed();
  }

  try {
    const payload = SignupSchema.parse(JSON.parse(event.body || "{}"));
    const ip = getClientIp(event.headers);
    const supabase = supabaseAdmin();
    await enforceRateLimit(
      supabase,
      `${rateLimitPolicies.certSignupIp.keyPrefix}:${ip}`,
      rateLimitPolicies.certSignupIp.limit,
      rateLimitPolicies.certSignupIp.windowMs
    );
    await enforceRateLimit(
      supabase,
      `${rateLimitPolicies.certSignupDomain.keyPrefix}:${emailDomain(payload.email)}`,
      rateLimitPolicies.certSignupDomain.limit,
      rateLimitPolicies.certSignupDomain.windowMs
    );
    const existing = await supabase
      .from("partners")
      .select("*")
      .eq("email", payload.email)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data?.status === "suspended") {
      throw Object.assign(new Error("This partner account is suspended."), { statusCode: 403 });
    }

    const status = existing.data?.status || partnerStatusForEmail(payload.email);
    const token = existing.data?.referral_token || referralToken(payload.firmName);
    const userId = existing.data?.id || (await createAuthUser(payload.email, payload.fullName, payload.firmName));

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

    if (status === "certified") {
      return jsonResponse(200, {
        partnerId: userId,
        partnerStatus: status,
        signingUrl: env("DOCUSIGN_RETURN_URL", "https://partners.ironcrowncapital.com/#portal"),
        referralToken: token,
        message: "Partner is already certified. No new DocuSign envelope was created."
      });
    }

    const reusableEnvelope = await findReusableEnvelope(userId);
    const envelope = await createPartnerAgreementEnvelope({
      email: payload.email,
      fullName: payload.fullName,
      firmName: payload.firmName,
      partnerId: userId,
      referralToken: token,
      existingEnvelopeId: reusableEnvelope?.envelope_id || null
    });
    await recordEnvelope(userId, envelope, reusableEnvelope);

    await sendTransactionalEmail({
      to: payload.email,
      ...isoReadyEmail(envelope.signingUrl)
    }, {
      eventKey: isoReadyEmailEventKey(userId, envelope.envelopeId),
      template: "iso_ready",
      payload: { partnerId: userId, envelopeId: envelope.envelopeId }
    });

    return jsonResponse(200, {
      partnerId: userId,
      partnerStatus: status,
      signingUrl: envelope.signingUrl,
      referralToken: token,
      message:
        status === "pending_manual_vetting"
          ? "Signup received. A VA must approve this partner before submissions open."
          : envelope.reused
            ? "Signup found the existing DocuSign envelope. Send the partner to the embedded signing URL."
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

    async function findReusableEnvelope(partnerId: string) {
      const { data, error } = await supabase
        .from("partner_esign_envelopes")
        .select("id,envelope_id,status,expires_at")
        .eq("partner_id", partnerId)
        .in("status", ["created", "sent", "delivered", "completed"])
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    }

    async function recordEnvelope(
      partnerId: string,
      envelope: Awaited<ReturnType<typeof createPartnerAgreementEnvelope>>,
      reusableEnvelope?: { id: string; envelope_id: string; status: string; expires_at: string } | null
    ) {
      if (reusableEnvelope && !envelope.reused) {
        await supabase
          .from("partner_esign_envelopes")
          .update({
            status: envelope.previousEnvelopeStatus || "expired",
            updated_at: new Date().toISOString()
          })
          .eq("id", reusableEnvelope.id);
      }

      const expiresAt = new Date(Date.now() + envelopeValidityDays() * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("partner_esign_envelopes").upsert(
        {
          partner_id: partnerId,
          provider: "docusign",
          envelope_id: envelope.envelopeId,
          status: envelope.status || "sent",
          expires_at: reusableEnvelope && envelope.reused ? reusableEnvelope.expires_at : expiresAt,
          updated_at: new Date().toISOString()
        },
        { onConflict: "envelope_id" }
      );
      if (error) {
        throw error;
      }
    }
  } catch (error) {
    return handleFunctionError(error);
  }
};

function envelopeValidityDays() {
  const days = Number(env("DOCUSIGN_ENVELOPE_VALID_DAYS", "30"));
  return Number.isFinite(days) && days > 0 ? days : 30;
}
