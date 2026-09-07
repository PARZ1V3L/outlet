/**
 * refresh() token rotation (OAuth 2.1 §6.1, SPEC §7.1). The vault voids the
 * presented refresh token the moment it answers a Bearer refresh; the SDK
 * dropping the rotated replacement stranded public clients (security
 * review finding). These tests pin: the rotated token is surfaced
 * camelCase, and the confidential path is untouched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { refresh } from "../src/index.js";

const wireSession = {
  grantId: "grant_1",
  keys: { openai: "sk-scoped" },
  capUsd: 5,
  expiresAt: "2026-08-01T00:00:00Z",
};

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refresh() — public client (Bearer)", () => {
  it("surfaces the rotated token as refreshToken and strips the wire key", async () => {
    const fn = mockFetch({ ...wireSession, refresh_token: "rt_new" });
    const s = await refresh("grant_1", { refreshToken: "rt_old" });
    expect(s.refreshToken).toBe("rt_new");
    expect(s).not.toHaveProperty("refresh_token");
    expect(s.keys.openai).toBe("sk-scoped");
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/grants/grant_1/refresh");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer rt_old");
  });
});

describe("refresh() — confidential client (app secret)", () => {
  it("passes the session through unchanged, no refreshToken field", async () => {
    const fn = mockFetch(wireSession);
    const s = await refresh("grant_1", { appSecret: "apps_x" });
    expect(s.refreshToken).toBeUndefined();
    expect(s).not.toHaveProperty("refreshToken");
    expect(s.grantId).toBe("grant_1");
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-outlet-app-secret"]).toBe("apps_x");
  });
});
