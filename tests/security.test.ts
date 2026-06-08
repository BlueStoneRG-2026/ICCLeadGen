import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { handleFunctionError } from "../netlify/functions/_shared/env";
import { getClientIp, handleCorsPreflight, jsonResponse } from "../netlify/functions/_shared/http";
import { handleUnsubscribe, parseUnsubscribeEmail } from "../netlify/functions/unsubscribe";

function event(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: "GET",
    headers: {},
    rawUrl: "https://icc-file-desk.netlify.app/.netlify/functions/test",
    body: "",
    ...overrides
  } as any;
}

describe("function security responses", () => {
  it("sanitizes unexpected 500s while preserving structured client errors", () => {
    const internal = handleFunctionError(Object.assign(new Error("database password leaked"), { statusCode: 500 }));
    expect(internal.statusCode).toBe(500);
    expect(internal.body).not.toContain("database password leaked");
    expect(JSON.parse(internal.body).error).toEqual({
      code: "internal_error",
      message: "Unexpected function error."
    });

    const validation = handleFunctionError(z.object({ email: z.string().email() }).safeParse({ email: "bad" }).error);
    expect(validation.statusCode).toBe(400);
    expect(JSON.parse(validation.body).error.code).toBe("validation_failed");
  });

  it("adds security and app-origin CORS headers to API responses", () => {
    vi.stubEnv("APP_ORIGIN", "https://icc-file-desk.netlify.app");
    const response = jsonResponse(200, { ok: true });
    expect(response.headers?.["access-control-allow-origin"]).toBe("https://icc-file-desk.netlify.app");
    expect(response.headers?.["x-content-type-options"]).toBe("nosniff");
    expect(response.headers?.["x-frame-options"]).toBe("DENY");
    vi.unstubAllEnvs();
  });

  it("allows preflight only for the configured app origin", () => {
    vi.stubEnv("APP_ORIGIN", "https://icc-file-desk.netlify.app");
    const allowed = handleCorsPreflight(
      event({ httpMethod: "OPTIONS", headers: { origin: "https://icc-file-desk.netlify.app" } })
    );
    const denied = handleCorsPreflight(
      event({ httpMethod: "OPTIONS", headers: { origin: "https://not-this-site.example" } })
    );

    expect(allowed?.statusCode).toBe(204);
    expect(denied?.statusCode).toBe(403);
    vi.unstubAllEnvs();
  });

  it("trusts Netlify's client IP header in production and ignores spoofable fallbacks", () => {
    vi.stubEnv("NETLIFY_DEV", "false");
    expect(
      getClientIp({
        "x-nf-client-connection-ip": "198.51.100.10",
        "x-forwarded-for": "10.0.0.1",
        "client-ip": "10.0.0.2"
      })
    ).toBe("198.51.100.10");
    expect(getClientIp({ "x-forwarded-for": "10.0.0.1", "client-ip": "10.0.0.2" })).toBe("unknown");
    vi.unstubAllEnvs();
  });
});

describe("request validation coverage", () => {
  it("keeps every body-parsing Netlify endpoint behind a Zod schema", () => {
    const files = readdirSync("netlify/functions")
      .filter((file) => file.endsWith(".ts"))
      .map((file) => `netlify/functions/${file}`);

    const bodyParsingFiles = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /JSON\.parse\(event\.body|parseMultipart\(event\)|URLSearchParams\(event\.body/.test(source);
    });

    expect(bodyParsingFiles.sort()).toEqual([
      "netlify/functions/admin-action.ts",
      "netlify/functions/cert-signup.ts",
      "netlify/functions/certified-email.ts",
      "netlify/functions/checker.ts",
      "netlify/functions/intake.ts",
      "netlify/functions/unsubscribe.ts"
    ]);

    bodyParsingFiles.forEach((file) => {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/from "zod"/);
      expect(source, file).toMatch(/Schema\.parse|EmailSchema\.parse/);
    });
  });

  it("does not let suspended partners restart certification", () => {
    const source = readFileSync("netlify/functions/cert-signup.ts", "utf8");
    expect(source).toContain('existing.data?.status === "suspended"');
    expect(source).toContain("This partner account is suspended.");
  });

  it("keeps CSP and core browser security headers in Netlify config", () => {
    const config = readFileSync("netlify.toml", "utf8");
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("X-Frame-Options = \"DENY\"");
  });

  it("cleans up uploaded storage objects when submission insert fails", () => {
    const source = readFileSync("netlify/functions/intake.ts", "utf8");
    expect(source).toContain("await supabase.storage.from(bucket).remove([storagePath])");
    expect(source.indexOf("remove([storagePath])")).toBeLessThan(source.indexOf("throw insertError"));
  });
});

describe("SendGrid List-Unsubscribe one-click endpoint", () => {
  it("accepts one-click POSTs with the email in the signed URL", async () => {
    const calls: any[] = [];
    const supabase = {
      from(table: string) {
        return {
          upsert(row: unknown, options: unknown) {
            calls.push({ table, row, options });
            return Promise.resolve({ error: null });
          }
        };
      }
    };

    const response = await handleUnsubscribe(
      event({
        httpMethod: "POST",
        rawUrl: "https://icc-file-desk.netlify.app/.netlify/functions/unsubscribe?email=Broker%40Example.com",
        body: "List-Unsubscribe=One-Click"
      }),
      supabase
    );

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        table: "suppression",
        row: { email: "broker@example.com", reason: "unsubscribe" },
        options: { onConflict: "email" }
      }
    ]);
  });

  it("prefers an explicit posted email when one is supplied", () => {
    const parsed = parseUnsubscribeEmail(
      event({
        httpMethod: "POST",
        rawUrl: "https://icc-file-desk.netlify.app/.netlify/functions/unsubscribe?email=url%40example.com",
        body: "email=Body%40Example.com"
      })
    );
    expect(parsed).toBe("body@example.com");
  });
});
