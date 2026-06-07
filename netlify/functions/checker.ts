import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { runRulesOnlyChecker } from "./_shared/checker";
import { handleFunctionError } from "./_shared/env";
import { jsonResponse, methodNotAllowed } from "./_shared/http";

const CheckerSchema = z.object({
  merchantName: z.string().optional(),
  fileName: z.string().optional(),
  text: z.string().optional()
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return methodNotAllowed();
  }

  try {
    const payload = CheckerSchema.parse(JSON.parse(event.body || "{}"));
    return jsonResponse(200, runRulesOnlyChecker(payload));
  } catch (error) {
    return handleFunctionError(error);
  }
};
