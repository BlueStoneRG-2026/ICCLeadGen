import type { HandlerEvent, HandlerResponse } from "@netlify/functions";

const allowedMethods = "GET,POST,OPTIONS";
const allowedHeaders = "authorization,content-type,x-internal-secret";

export function responseHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "access-control-allow-methods": allowedMethods,
    "access-control-allow-headers": allowedHeaders,
    vary: "Origin",
    ...extra
  };

  const origin = configuredAppOrigins()[0];
  if (origin) {
    headers["access-control-allow-origin"] = origin;
  }

  return headers;
}

export function jsonResponse(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: responseHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body)
  };
}

export function textResponse(statusCode: number, body: string): HandlerResponse {
  return {
    statusCode,
    headers: responseHeaders({ "content-type": "text/plain; charset=utf-8" }),
    body
  };
}

export function methodNotAllowed() {
  return jsonResponse(405, {
    error: {
      code: "method_not_allowed",
      message: "Method not allowed."
    }
  });
}

export function handleCorsPreflight(event: HandlerEvent): HandlerResponse | null {
  if (event.httpMethod !== "OPTIONS") {
    return null;
  }

  const requestOrigin = event.headers.origin || event.headers.Origin || "";
  if (!isAllowedCorsOrigin(requestOrigin)) {
    return jsonResponse(403, { error: { code: "cors_forbidden", message: "Origin is not allowed." } });
  }

  return {
    statusCode: 204,
    headers: responseHeaders(),
    body: ""
  };
}

export function getClientIp(headers: Record<string, string | undefined>) {
  const netlifyIp = headers["x-nf-client-connection-ip"];
  if (netlifyIp) {
    return netlifyIp;
  }

  if (process.env.NETLIFY_DEV === "true") {
    return headers["x-forwarded-for"]?.split(",")[0]?.trim() || headers["client-ip"] || "unknown";
  }

  return "unknown";
}

export function getBearerToken(headers: Record<string, string | undefined>) {
  const header = headers.authorization || headers.Authorization;
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function configuredAppOrigins() {
  return (process.env.APP_ORIGIN || process.env.URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedCorsOrigin(origin: string) {
  if (!origin) {
    return true;
  }

  const allowed = configuredAppOrigins();
  if (allowed.length > 0) {
    return allowed.includes(origin);
  }

  return process.env.NETLIFY_DEV === "true" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
