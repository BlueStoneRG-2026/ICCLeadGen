import type { AdminData, CertificationResult, IntakeResult, PortalData } from "../types";
import { mockAdminData, mockCertification, mockIntakeResult, mockPortalData } from "../data/mock";

const functionBase = import.meta.env.VITE_FUNCTION_BASE || "/.netlify/functions";
const forceLive = import.meta.env.VITE_DEMO_MODE === "false";

export function useDemoMode() {
  return !forceLive && !import.meta.env.VITE_SUPABASE_URL;
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || body.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function submitRescue(formData: FormData): Promise<IntakeResult> {
  if (useDemoMode()) {
    await new Promise((resolve) => window.setTimeout(resolve, 720));
    return mockIntakeResult(formData);
  }

  const response = await fetch(`${functionBase}/intake`, {
    method: "POST",
    body: formData
  });
  return parseJson<IntakeResult>(response);
}

export async function certifyPartner(payload: Record<string, unknown>): Promise<CertificationResult> {
  if (useDemoMode()) {
    await new Promise((resolve) => window.setTimeout(resolve, 580));
    return mockCertification(payload);
  }

  const response = await fetch(`${functionBase}/cert-signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJson<CertificationResult>(response);
}

export async function getPortalData(accessToken?: string): Promise<PortalData> {
  if (useDemoMode()) {
    await new Promise((resolve) => window.setTimeout(resolve, 240));
    return mockPortalData;
  }

  const response = await fetch(`${functionBase}/portal-data`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
  });
  return parseJson<PortalData>(response);
}

export async function getAdminData(accessToken?: string): Promise<AdminData> {
  if (useDemoMode()) {
    await new Promise((resolve) => window.setTimeout(resolve, 240));
    return mockAdminData;
  }

  const response = await fetch(`${functionBase}/admin-data`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
  });
  return parseJson<AdminData>(response);
}

export async function adminAction(action: string, payload: Record<string, unknown>, accessToken?: string) {
  if (useDemoMode()) {
    await new Promise((resolve) => window.setTimeout(resolve, 360));
    return { ok: true, message: "Demo action completed." };
  }

  const response = await fetch(`${functionBase}/admin-action`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({ action, ...payload })
  });
  return parseJson<{ ok: boolean; message: string }>(response);
}
