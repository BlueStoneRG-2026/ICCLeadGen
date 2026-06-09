import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { env, handleFunctionError } from "./_shared/env";
import { certifiedPartnerEmail, enqueueTransactionalEmail, processOutboxEvent } from "./_shared/email";
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
    const outboxEvent = await enqueueTransactionalEmail({
      to: payload.email,
      ...certifiedPartnerEmail(payload.fullName, payload.referralToken)
    }, {
      eventKey: `certified:${payload.referralToken}`,
      template: "certified_partner",
      payload: { referralToken: payload.referralToken }
    });
    const result = await processOutboxEvent(outboxEvent.id, { force: true });

    return jsonResponse(200, { ok: result.ok, message: result.message });
  } catch (error) {
    return handleFunctionError(error);
  }
};
