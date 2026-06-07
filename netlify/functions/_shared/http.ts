import type { HandlerResponse } from "@netlify/functions";

export function jsonResponse(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export function methodNotAllowed() {
  return jsonResponse(405, { error: "Method not allowed." });
}

export function getClientIp(headers: Record<string, string | undefined>) {
  return (
    headers["x-nf-client-connection-ip"] ||
    headers["client-ip"] ||
    headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function getBearerToken(headers: Record<string, string | undefined>) {
  const header = headers.authorization || headers.Authorization;
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}
