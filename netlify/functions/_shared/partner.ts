import crypto from "node:crypto";
import { z } from "zod";

export const ReferrerTypeSchema = z.enum(["broker_mca", "amazon_agency", "accountant"]);

export const genericEmailDomains = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

export function emailDomain(email: string) {
  return email.split("@")[1]?.trim().toLowerCase() || "";
}

export function isGenericEmail(email: string) {
  return genericEmailDomains.has(emailDomain(email));
}

export function partnerStatusForEmail(email: string) {
  return isGenericEmail(email) ? "pending_manual_vetting" : "provisional";
}

export function referralToken(firmName?: string | null) {
  const prefix = (firmName || "ICC")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 5)
    .toUpperCase()
    .padEnd(3, "X");
  return `ICC-${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

export function randomPassword() {
  return `${crypto.randomUUID()}-${crypto.randomBytes(12).toString("hex")}`;
}
