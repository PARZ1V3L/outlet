import { afterEach, describe, expect, it, vi } from "vitest";
import Outlet, { OutletError } from "../src/index.js";

// When the vault host is unreachable, vault-mode calls hit a network failure.
// The SDK should soften that into a clear OutletError, not a raw "fetch failed".
describe("vault mode while the vault is unreachable", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubUnreachable = () =>
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  it("connect() softens a network failure into OutletError(vault_unavailable)", async () => {
    stubUnreachable();
    const err = await Outlet.connect({
      appId: "app_test",
      providers: ["openai"],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OutletError);
    expect(err.code).toBe("vault_unavailable");
    expect(err.message).toContain("Try again in a moment");
    expect(err.message).toContain("hello@useoutlet.dev");
  });

  it("status() on a vault grant softens the same way", async () => {
    stubUnreachable();
    await expect(Outlet.status("grant_abc123")).rejects.toMatchObject({
      code: "vault_unavailable",
    });
  });
});

// The vault's billing gate (SPEC §6.2) answers 402 vault_requires_billing to
// the developer only. The SDK surfaces the checkout hint on that code alone;
// every other code keeps the generic message.
describe("vault_requires_billing speaks to the developer", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubStatus = (status: number, code: string) =>
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, code, message: "vault words" }), {
        status, headers: { "content-type": "application/json" },
      })));

  it("connect() carries the checkout hint with code and status intact", async () => {
    stubStatus(402, "vault_requires_billing");
    const err = await Outlet.connect({
      appId: "app_test", providers: ["openai"], appSecret: "apps_x",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OutletError);
    expect(err.code).toBe("vault_requires_billing");
    expect(err.status).toBe(402);
    expect(err.message).toMatch(/add a payment method to enable vault mode/i);
    expect(err.message).toMatch(/existing connections keep working/i);
  });

  it("other codes keep the generic message", async () => {
    stubStatus(401, "app_unregistered");
    const err = await Outlet.status("grant_abc123", { appSecret: "apps_x" }).catch((e) => e);
    expect(err.code).toBe("app_unregistered");
    expect(err.message).toBe("Outlet API error (401)");
  });
});

// The vault requires the app secret on the poll of a connection request as
// on the request itself; a confidential app's poll without it answers 401.
describe("connect() polls the connection request with the app secret", () => {
  afterEach(() => vi.unstubAllGlobals());

  const complete = {
    status: "complete", grantId: "grant_1", keys: { openai: "app-key" }, capUsd: 10,
    expiresAt: "2026-12-31T00:00:00Z",
  };
  const stubVault = () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      const body = init?.method === "POST"
        ? { grantRequestId: "gr_1", grantUrl: "https://useoutlet.dev/grant/gr_1" }
        : complete;
      return new Response(JSON.stringify(body), {
        status: init?.method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    }));
    return calls;
  };

  it("a confidential app's poll carries the secret the request carried", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = stubVault();
    const session = await Outlet.connect({
      appId: "app_test", providers: ["openai"], appSecret: "apps_x",
    });
    expect(session.grantId).toBe("grant_1");
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.useoutlet.dev/v0/grants",
      "https://api.useoutlet.dev/v0/grants/gr_1",
    ]);
    for (const c of calls) expect(c.headers["x-outlet-app-secret"]).toBe("apps_x");
  });

  it("an app without a secret sends no secret header on either call", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = stubVault();
    await Outlet.connect({ appId: "app_test", providers: ["openai"] });
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c.headers["x-outlet-app-secret"]).toBeUndefined();
  });
});
