import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { env, handleFunctionError } from "./_shared/env";
import { certifiedPartnerEmail, sendTransactionalEmail } from "./_shared/email";
import { handleCorsPreflight, jsonResponse, methodNotAllowed } from "./_shared/http";

const PayloadSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  referralToken: z.string().min(1)
});

export const handler: Handler = async (event) => {
  const cors = handleCorsPreflight(event);
  if (cors) return cors;

  if (event.httpMethod !== "POST") {
    return methodNotAllowed();
  }

  try {
    const expected = env("INTERNAL_WEBHOOK_SECRET");
    if (expected && event.headers["x-internal-secret"] !== expected) {
      return jsonResponse(401, { error: "Invalid internal webhook secret." });
    }

    const payload = PayloadSchema.parse(JSON.parse(event.body || "{}"));
    await sendTransactionalEmail({
      to: payload.email,
      ...certifiedPartnerEmail(payload.fullName, payload.referralToken)
    });

    return jsonResponse(200, { ok: true, message: "Certified email sent." });
  } catch (error) {
    return handleFunctionError(error);
  }
};
