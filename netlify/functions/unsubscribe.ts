import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { handleFunctionError, supabaseAdmin } from "./_shared/env";

const EmailSchema = z.string().email().transform((value) => value.toLowerCase());

export const handler: Handler = async (event) => {
  try {
    const email =
      event.httpMethod === "POST"
        ? EmailSchema.parse(new URLSearchParams(event.body || "").get("email") || new URL(event.rawUrl).searchParams.get("email"))
        : EmailSchema.parse(new URL(event.rawUrl).searchParams.get("email"));

    const supabase = supabaseAdmin();
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

    return {
      statusCode: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "Unsubscribed."
    };
  } catch (error) {
    return handleFunctionError(error);
  }
};
