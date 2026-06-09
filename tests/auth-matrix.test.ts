import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

function event(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  } as any;
}

async function loadEnvWithTokenUsers(usersByToken: Record<string, string | null>) {
  vi.resetModules();
  vi.doMock("@supabase/supabase-js", () => ({
    createClient: () => ({
      auth: {
        getUser: async (token: string) => {
          const email = usersByToken[token];
          if (!email) {
            return { data: { user: null }, error: new Error("invalid token") };
          }
          return { data: { user: { email } }, error: null };
        }
      }
    })
  }));

  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com,va@example.com");
  return import("../netlify/functions/_shared/env");
}

afterEach(() => {
  vi.doUnmock("@supabase/supabase-js");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("protected endpoint auth matrix", () => {
  it("rejects missing tokens for admin endpoints", async () => {
    const { requireAdmin } = await loadEnvWithTokenUsers({});
    await expect(requireAdmin(event())).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects forged or invalid bearer tokens", async () => {
    const { requireAdmin } = await loadEnvWithTokenUsers({ valid: "admin@example.com" });
    await expect(requireAdmin(event("forged"))).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects valid non-admin users server-side", async () => {
    const { requireAdmin } = await loadEnvWithTokenUsers({ valid: "broker@example.com" });
    await expect(requireAdmin(event("valid"))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("accepts allowlisted admin users from the validated token only", async () => {
    const { requireAdmin } = await loadEnvWithTokenUsers({ valid: "VA@Example.com" });
    await expect(requireAdmin(event("valid"))).resolves.toMatchObject({ email: "VA@Example.com" });
  });

  it("keeps every protected Netlify function behind the expected server-side gate", () => {
    const protectedFunctions = {
      "netlify/functions/admin-action.ts": "requireAdmin",
      "netlify/functions/admin-data.ts": "requireAdmin",
      "netlify/functions/portal-data.ts": "requireUser"
    };

    Object.entries(protectedFunctions).forEach(([file, gate]) => {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain(`${gate}(event)`);
    });
  });
});
