import type { SupabaseClient } from "@supabase/supabase-js";

export async function enforceRateLimit(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowMs: number
) {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw Object.assign(new Error("Rate limit reached. Try again later."), { statusCode: 429 });
  }
}
