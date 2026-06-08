import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { handleFunctionError, supabaseAdmin } from "./_shared/env";
import { handleCorsPreflight, methodNotAllowed, textResponse } from "./_shared/http";

const EmailSchema = z.string().email().transform((value) => value.toLowerCase());

export const handler: Handler = async (event) => {
  const cors = handleCorsPreflight(event);
  if (cors) return cors;

  if (!["GET", "POST"].includes(event.httpMethod)) {
    return methodNotAllowed();
  }

  try {
    return handleUnsubscribe(event, supabaseAdmin());
  } catch (error) {
    return handleFunctionError(error);
  }
};

export async function handleUnsubscribe(event: Parameters<Handler>[0], supabase: any) {
  const email = parseUnsubscribeEmail(event);
  const { error } = await supabase.from("suppression").upsert(
    {
      email,
      reason: "unsubscribe"
    },
    { onConflict: "email" }
  );
  if (error) {
    throw error;
  }

  return textResponse(200, "Unsubscribed.");
}

export function parseUnsubscribeEmail(event: Parameters<Handler>[0]) {
  const urlEmail = new URL(event.rawUrl).searchParams.get("email");
  const postEmail = event.httpMethod === "POST" ? new URLSearchParams(event.body || "").get("email") : "";
  return EmailSchema.parse(postEmail || urlEmail);
}
