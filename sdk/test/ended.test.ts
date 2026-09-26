/**
 * Connection ends against a fake vault (NEVER-DEAD-END-2026-09-26, section
 * 1 in its new form): a capped, revoked or expired Vault connection and a
 * refused Direct API key are one typed error, ConnectionEndedError, from
 * status(), refresh() and the fetch from wrapFetch().
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import Outlet, { ConnectionEndedError, OutletError, type GrantInfo, type OutletSession } from "../src/index.js";

const info = (status: GrantInfo["status"], reason?: GrantInfo["reason"]): GrantInfo => ({
  grantId: "grant_1", status, providers: ["openai"], capUsd: 5, spendUsd: 5.02, ...(reason ? { reason } : {}),
});
const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const vault = (route: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const fn = vi.fn(async (url: string, init?: RequestInit) => route(url, init));
  vi.stubGlobal("fetch", fn);
  return fn;
};
const refused = (code: string, status: number) => answer({ ok: false, code, message: "vault words" }, status);

afterEach(() => vi.unstubAllGlobals());

describe("Vault capped", () => {
  it.each(["spend", "unreadable", "currency"] as const)("reason %s: status() and refresh() throw ConnectionEndedError capped", async (reason) => {
    vault((url) => url.endsWith("/status") ? answer(info("capped", reason)) : refused("grant_capped", 409));
    const a = await Outlet.status("grant_1", { refreshToken: "rt_1" }).catch((x) => x);
    expect(a).toBeInstanceOf(ConnectionEndedError);
    expect(a).toBeInstanceOf(OutletError);
    expect(a).toMatchObject({ code: "connection_ended", reason: "capped", grantId: "grant_1", provider: "openai", status: 409 });
    expect(a.info).toEqual(info("capped", reason));
    expect(a.message).toBe("This Vault connection is paused at its cap. When the user raises the cap on useoutlet.dev, refresh() returns the key.");
    const b = await Outlet.refresh("grant_1", { refreshToken: "rt_1" }).catch((x) => x);
    expect(b).toBeInstanceOf(ConnectionEndedError);
    expect(b).toMatchObject({ reason: "capped", grantId: "grant_1", status: 409 });
    expect(b.info).toBeUndefined();
  });
});

describe("Vault revoked or disconnected", () => {
  it("status() and refresh() throw ConnectionEndedError revoked", async () => {
    vault((url) => url.endsWith("/status") ? answer(info("revoked")) : refused("grant_revoked", 409));
    const a = await Outlet.status("grant_1", { appSecret: "apps_x" }).catch((x) => x);
    expect(a).toMatchObject({ code: "connection_ended", reason: "revoked", grantId: "grant_1", info: info("revoked") });
    expect(a.message).toBe("This Vault connection was revoked. Ask the user to connect again.");
    const b = await Outlet.refresh("grant_1", { appSecret: "apps_x" }).catch((x) => x);
    expect(b).toBeInstanceOf(ConnectionEndedError);
    expect(b.reason).toBe("revoked");
  });
});

describe("refresh token expired or rotated away", () => {
  it("status() and refresh() throw ConnectionEndedError expired on the vault's 401", async () => {
    vault(() => refused("unauthorized", 401));
    const a = await Outlet.status("grant_1", { refreshToken: "rt_old" }).catch((x) => x);
    const b = await Outlet.refresh("grant_1", { refreshToken: "rt_old" }).catch((x) => x);
    for (const e of [a, b]) {
      expect(e).toBeInstanceOf(ConnectionEndedError);
      expect(e).toMatchObject({ reason: "expired", grantId: "grant_1", status: 401 });
      expect(e.message).toBe("This Vault connection can no longer be refreshed. Ask the user to connect again.");
    }
  });
  it("every other refusal stays the plain OutletError it was", async () => {
    vault(() => refused("app_unregistered", 401));
    const e = await Outlet.status("grant_1", { appSecret: "apps_x" }).catch((x) => x);
    expect(e).toBeInstanceOf(OutletError);
    expect(e).not.toBeInstanceOf(ConnectionEndedError);
    expect(e.code).toBe("app_unregistered");
    vault(() => refused("grant_pending", 409));
    const p = await Outlet.refresh("grant_1", { appSecret: "apps_x" }).catch((x) => x);
    expect(p).not.toBeInstanceOf(ConnectionEndedError);
    expect(p.code).toBe("grant_pending");
  });
  it("an open connection answers as before", async () => {
    vault((url) => url.endsWith("/status") ? answer(info("active")) : answer({ grantId: "grant_1", keys: { openai: "sk-new" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z", refresh_token: "rt_2" }));
    expect(await Outlet.status("grant_1", { refreshToken: "rt_1" })).toEqual(info("active"));
    const s = await Outlet.refresh("grant_1", { refreshToken: "rt_1" });
    expect(s.keys.openai).toBe("sk-new");
    expect(s.refreshToken).toBe("rt_2");
  });
});

describe("Direct: the provider refuses the pasted key", () => {
  const provider401 = () => answer({ error: { message: "Incorrect API key provided", code: "invalid_api_key" } }, 401);
  it("the wrapper turns the provider's 401 into ConnectionEndedError refused, naming the provider", async () => {
    const session = await Outlet.direct({ keys: { openai: "sk-proj-refusedkey123" } });
    const fetchMock = vi.fn(async () => provider401());
    const wrapped = Outlet.wrapFetch({ session, fetch: fetchMock });
    const e = await wrapped("https://api.openai.com/v1/responses", { method: "POST" }).catch((x) => x);
    expect(e).toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({ reason: "refused", grantId: session.grantId, provider: "openai", status: 401 });
    expect(e.message).toBe("OpenAI refused this Direct API key. Ask the user for a new one.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("a Direct 429 or 403 is the provider's own answer and passes through", async () => {
    const session = await Outlet.direct({ keys: { groq: "gsk_abc" } });
    for (const status of [429, 403, 402, 500, 200]) {
      const wrapped = Outlet.wrapFetch({ session, fetch: async () => answer({ error: "x" }, status) });
      const res = await wrapped("https://api.groq.com/openai/v1/chat/completions");
      expect(res.status).toBe(status);
    }
  });
  it("status() and refresh() still say there is no vault grant behind a Direct session", async () => {
    const session = await Outlet.direct({ keys: { openai: "sk-proj-refusedkey123" } });
    for (const call of [Outlet.status(session.grantId), Outlet.refresh(session.grantId)]) {
      await expect(call).rejects.toMatchObject({ code: "direct_mode_session" });
    }
  });
});

describe("wrapFetch() on a Vault session", () => {
  const session: OutletSession & { refreshToken: string } = {
    grantId: "grant_1", keys: { openai: "sk-scoped" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z", mode: "vault", refreshToken: "rt_1",
  };
  const providerSays = (status: number) => answer({ error: "provider words" }, status);
  it.each([401, 402, 403, 429])("a provider %s on an ended connection becomes the typed error after one status() check", async (code) => {
    const calls: string[] = [];
    vault((url, init) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer rt_1");
      return answer(info("capped", "spend"));
    });
    const wrapped = Outlet.wrapFetch({ session: () => session, fetch: async () => providerSays(code) });
    const e = await wrapped("https://api.openai.com/v1/responses").catch((x) => x);
    expect(e).toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({ reason: "capped", grantId: "grant_1" });
    expect(calls).toEqual(["https://api.useoutlet.dev/v0/grants/grant_1/status"]);
  });
  it("a provider 401 on a revoked connection, and on a connection whose token is gone", async () => {
    vault(() => answer(info("revoked")));
    let e = await Outlet.wrapFetch({ session, fetch: async () => providerSays(401) })("https://api.openai.com/v1/x").catch((x) => x);
    expect(e).toMatchObject({ reason: "revoked" });
    vault(() => refused("unauthorized", 401));
    e = await Outlet.wrapFetch({ session, fetch: async () => providerSays(401) })("https://api.openai.com/v1/x").catch((x) => x);
    expect(e).toMatchObject({ reason: "expired" });
  });
  it("a provider 429 on an open connection is the provider's answer, untouched", async () => {
    vault(() => answer(info("active")));
    const res = await Outlet.wrapFetch({ session, fetch: async () => providerSays(429) })("https://api.openai.com/v1/x");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "provider words" });
  });
  it("a 200 never asks the vault; a vault that cannot be reached leaves the provider's answer standing", async () => {
    const fn = vault(() => answer(info("active")));
    const ok = await Outlet.wrapFetch({ session, fetch: async () => providerSays(200) })("https://api.openai.com/v1/x");
    expect(ok.status).toBe(200);
    expect(fn).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const res = await Outlet.wrapFetch({ session, fetch: async () => providerSays(401) })("https://api.openai.com/v1/x");
    expect(res.status).toBe(401);
  });
  it("a confidential app passes its secret; the session function is read on every call", async () => {
    const fn = vault((_url, init) => {
      expect((init?.headers as Record<string, string>)["x-outlet-app-secret"]).toBe("apps_x");
      return answer(info("active"));
    });
    let current: OutletSession | null = { ...session, refreshToken: undefined as unknown as string };
    const wrapped = Outlet.wrapFetch({ session: () => current, appSecret: "apps_x", fetch: async () => providerSays(403) });
    expect((await wrapped("https://api.openai.com/v1/x")).status).toBe(403);
    expect(fn).toHaveBeenCalledTimes(1);
    current = null;
    expect((await wrapped("https://api.openai.com/v1/x")).status).toBe(403);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
