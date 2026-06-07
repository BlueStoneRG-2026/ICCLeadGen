import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function hasSupabaseBrowserConfig() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseBrowserConfig()) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return client;
}

export type BrowserSession = Session;
