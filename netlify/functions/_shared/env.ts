import { createClient } from "@supabase/supabase-js";
import type { HandlerEvent } from "@netlify/functions";
import { getBearerToken, jsonResponse } from "./http";
import { ZodError } from "zod";

export function env(name: string, fallback = "") {
  return process.env[name] || fallback;
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function supabaseAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function supabaseAnon(accessToken: string) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { authorization: `Bearer ${accessToken}` }
    }
  });
}

export async function requireUser(event: HandlerEvent) {
  const token = getBearerToken(event.headers);
  if (!token) {
    throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw Object.assign(new Error("Invalid bearer token."), { statusCode: 401 });
  }
  return data.user;
}

export async function requireAdmin(event: HandlerEvent) {
  if (localAdminBypassAllowed()) {
    return { email: "local-admin@example.com" };
  }

  const user = await requireUser(event);
  const email = user.email?.toLowerCase();
  const admins = env("ADMIN_EMAILS")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!email || !admins.includes(email)) {
    throw Object.assign(new Error("Admin access denied."), { statusCode: 403 });
  }

  return user;
}

function localAdminBypassAllowed() {
  if (env("LOCAL_ADMIN_BYPASS") !== "true") {
    return false;
  }

  if (env("NETLIFY") === "true" && env("NETLIFY_DEV") !== "true") {
    console.warn("LOCAL_ADMIN_BYPASS is ignored outside local/dev environments.");
    return false;
  }

  const context = env("CONTEXT").toLowerCase();
  const nodeEnv = env("NODE_ENV").toLowerCase();
  return env("NETLIFY_DEV") === "true" || context === "dev" || nodeEnv === "development";
}

export function handleFunctionError(error: unknown) {
  const err = error as Error & { statusCode?: number };
  if (error instanceof ZodError) {
    return jsonResponse(400, {
      error: {
        code: "validation_failed",
        message: "Request validation failed.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    });
  }

  if (error instanceof SyntaxError) {
    return jsonResponse(400, {
      error: {
        code: "invalid_json",
        message: "Request body is not valid JSON."
      }
    });
  }

  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    console.error("Function error", error);
    return jsonResponse(statusCode, {
      error: {
        code: "internal_error",
        message: "Unexpected function error."
      }
    });
  }

  return jsonResponse(statusCode, {
    error: {
      code: errorCodeForStatus(statusCode),
      message: err.message || "Request failed."
    }
  });
}

function errorCodeForStatus(statusCode: number) {
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 413) return "payload_too_large";
  if (statusCode === 415) return "unsupported_media_type";
  if (statusCode === 422) return "unprocessable_entity";
  if (statusCode === 429) return "rate_limited";
  return "request_failed";
}
