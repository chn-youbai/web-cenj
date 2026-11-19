import { describe, expect, it } from "vitest";
import {
  extractProvidedSecret,
  safeEqual,
  verifyAccessPassword,
  verifyAdminPassword,
} from "../functions/_lib/auth";
import type { Env } from "../functions/_lib/env";
import {
  escapeHtml,
  getErrorMessage,
  jsonResponse,
  noStoreJsonResponse,
  readJsonBody,
} from "../functions/_lib/http";

describe("functions/_lib/auth", () => {
  it("compares strings in constant-time helper", () => {
    expect(safeEqual("secret-123", "secret-123")).toBe(true);
    expect(safeEqual("secret-123", "secret-124")).toBe(false);
    expect(safeEqual("short", "longer")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });

  it("extracts secrets from headers, body, and query params in priority order", () => {
    const reqHeader = new Request("https://example.com/api/test?pwd=query", {
      headers: { "X-Admin-Password": "header-secret" },
    });
    expect(extractProvidedSecret(reqHeader, { password: "body-secret" })).toBe("header-secret");

    const reqBody = new Request("https://example.com/api/test?pwd=query");
    expect(extractProvidedSecret(reqBody, { password: "body-secret" })).toBe("body-secret");

    const reqQuery = new Request("https://example.com/api/test?pwd=query-secret");
    expect(extractProvidedSecret(reqQuery, null)).toBe("query-secret");
  });

  it("denies by default when env passwords are unconfigured", () => {
    const emptyEnv: Env = {};
    const req = new Request("https://example.com/api/test", {
      headers: { "X-Admin-Password": "any" },
    });
    expect(verifyAdminPassword(emptyEnv, req)).toEqual({ valid: false, configured: false });
    expect(verifyAccessPassword(emptyEnv, req)).toEqual({ valid: false, configured: false });
  });

  it("validates configured admin and access passwords", () => {
    const env: Env = {
      ADMIN_PASSWORD: "admin-unit-test-value",
      ACCESS_PASSWORD: "access-unit-test-value",
    };

    const okAdmin = new Request("https://example.com/api/test", {
      headers: { Authorization: "Bearer admin-unit-test-value" },
    });
    expect(verifyAdminPassword(env, okAdmin)).toEqual({ valid: true, configured: true });

    const badAdmin = new Request("https://example.com/api/test", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(verifyAdminPassword(env, badAdmin)).toEqual({ valid: false, configured: true });

    const okAccess = new Request("https://example.com/api/sub?pwd=access-unit-test-value");
    expect(verifyAccessPassword(env, okAccess)).toEqual({ valid: true, configured: true });
  });
});

describe("functions/_lib/http", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<script>alert("x&'y'")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;&#039;y&#039;&quot;)&lt;/script&gt;",
    );
  });

  it("formats JSON and no-store responses with CORS headers", async () => {
    const resp = jsonResponse({ ok: true }, 201);
    expect(resp.status).toBe(201);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await resp.json()).toEqual({ ok: true });

    const noStore = noStoreJsonResponse({ secret: false });
    expect(noStore.headers.get("Cache-Control")).toContain("no-store");
  });

  it("parses JSON bodies safely and extracts error messages", async () => {
    const validReq = new Request("https://example.com/api/test", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });
    expect(await readJsonBody<{ hello: string }>(validReq)).toEqual({
      ok: true,
      data: { hello: "world" },
    });

    const invalidReq = new Request("https://example.com/api/test", {
      method: "POST",
      body: "not-json",
    });
    expect(await readJsonBody(invalidReq)).toEqual({ ok: false });
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage(42)).toBe("Unknown server error");
  });
});
