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
