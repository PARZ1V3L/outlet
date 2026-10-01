/**
 * After the sign-in, against the fake OpenAI: restorePlan(), refreshPlan(),
 * forgetPlan(), planModels(), and a refresh that ends the connection as
 * ConnectionEndedError.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Outlet, { ConnectionEndedError, OutletError } from "../../src/index.js";
import {
  connectPlan, forgetPlan, planFileStore, planModels, refreshPlan, restorePlan,
  type PlanRecord, type PlanStore,
} from "../../src/plan/index.js";
import { type Fake, fakeOpenAI, visit } from "./fake-openai.js";

let fake: Fake;
let dir: string;
let store: PlanStore & { path: string };
const who = () => ({ provider: "openai" as const, appName: "Test App", store, endpoints: fake.endpoints });
const signIn = () => connectPlan({ ...who(), port: 0, timeoutMs: 5000, open: (url) => { void visit(url); } });
const record = async () => (await store.load()) as PlanRecord;
const refreshes = () => fake.requests.filter((r) => r.path === "/token" && r.form.get("grant_type") === "refresh_token");
/** Make the saved token due for a refresh, with `left` ms before it expires. */
async function age(left: number) {
  const r = await record();
  await store.save({ ...r, earliestRefreshAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + left).toISOString() });
}

beforeAll(async () => { fake = await fakeOpenAI(); });
afterAll(() => fake.close());
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "outlet-plan-"));
  store = planFileStore("Test App", { dir });
  fake.refreshFailure = null;
  fake.revokeStatus = 200;
  fake.scope = "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe("restorePlan()", () => {
  it("is null with nothing saved, and asks OpenAI nothing", async () => {
    const before = fake.requests.length;
    expect(await restorePlan(who())).toBeNull();
    expect(fake.requests.length).toBe(before);
  });

  it("returns the saved session with no browser and no call while the token is fresh", async () => {
    const session = await signIn();
    const before = fake.requests.length;
    expect(await restorePlan(who())).toEqual(session);
    expect(fake.requests.length).toBe(before);
  });

  it("refreshes a token near its end and saves the rotated refresh token", async () => {
    const session = await signIn();
    const old = await record();
    await age(120_000);
    const restored = (await restorePlan(who()))!;
    expect(restored.grantId).toBe(session.grantId);
    expect(restored.keys.openai).not.toBe(session.keys.openai);
    const now = await record();
    expect(now.refreshToken).not.toBe(old.refreshToken);
    expect(now.accessToken).toBe(restored.keys.openai);
  });

  it("a temporary failure is not an end: a token with time left is returned as it is", async () => {
    const session = await signIn();
    await age(120_000);
    fake.refreshFailure = { status: 503, body: { error: "temporarily_unavailable" } };
    expect((await restorePlan(who()))!.keys.openai).toBe(session.keys.openai);
    // Once the token has run out there is nothing good to return: the failure passes through.
    await age(-1000);
    const e = await restorePlan(who()).catch((x) => x);
    expect(e).toBeInstanceOf(OutletError);
    expect(e).not.toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({ code: "plan_refresh_failed", status: 503 });
    expect((await record()).refreshToken).toMatch(/^rt_/);
  });
});

describe("refreshPlan()", () => {
  it("sends OpenAI's refresh and saves the rotated token before it returns", async () => {
    const session = await signIn();
    const old = await record();
    const saves: (string | undefined)[] = [];
    const watched: PlanStore = { ...store, save: async (r) => { saves.push(r.refreshToken); await store.save(r); } };
    const next = await refreshPlan(session, { store: watched, endpoints: fake.endpoints });
    const form = refreshes().at(-1)!.form;
    expect([...form.keys()].sort()).toEqual(["client_id", "grant_type", "refresh_token", "resource"]);
    expect(form.get("client_id")).toBe(old.clientId);
    expect(form.get("refresh_token")).toBe(old.refreshToken);
    expect(form.get("resource")).toBe(fake.endpoints.api);
    expect(next).toMatchObject({ grantId: session.grantId, mode: "plan", appName: "Test App", capUsd: Number.POSITIVE_INFINITY });
    expect(next.keys.openai).not.toBe(session.keys.openai);
    const now = await record();
    expect(saves).toEqual([now.refreshToken]);
    expect(now.refreshToken).not.toBe(old.refreshToken);
    expect(JSON.stringify(next)).not.toContain(now.refreshToken);
  });

  it("two refreshes at once spend the rotating token once", async () => {
    const session = await signIn();
    const before = refreshes().length;
    const [a, b] = await Promise.all([
      refreshPlan(session, { store, endpoints: fake.endpoints }),
      refreshPlan(session, { store: planFileStore("Test App", { dir }), endpoints: fake.endpoints }),
    ]);
    expect(refreshes().length).toBe(before + 1);
    expect(a.keys.openai).toBe(b.keys.openai);
    expect(a.keys.openai).not.toBe(session.keys.openai);
  });

  it("security 5: a failed save is an error, never a silent pass", async () => {
    const session = await signIn();
    const broken: PlanStore = { ...store, save: async () => { throw new OutletError("no room", "plan_store_failed"); } };
    await expect(refreshPlan(session, { store: broken, endpoints: fake.endpoints })).rejects.toMatchObject({ code: "plan_store_failed" });
  });

  it("needs a plan session", async () => {
    const direct = await Outlet.direct({ keys: { openai: "sk-proj-abc123" } });
    await expect(refreshPlan(direct, { store })).rejects.toMatchObject({
      code: "plan_session_required", message: "This call needs a ChatGPT plan session from connectPlan() or restorePlan().",
    });
  });
});

describe("the ends, as ConnectionEndedError", () => {
  const ends: [string, "expired" | "revoked", string][] = [
    ["invalid_grant", "expired", "This ChatGPT plan connection can no longer be refreshed. Ask the user to sign in again."],
    ["invalid_refresh_token", "expired", "This ChatGPT plan connection can no longer be refreshed. Ask the user to sign in again."],
    ["token_expired", "expired", "This ChatGPT plan connection can no longer be refreshed. Ask the user to sign in again."],
    ["refresh_token_expired", "expired", "This ChatGPT plan connection can no longer be refreshed. Ask the user to sign in again."],
    ["refresh_token_reused", "expired", "This ChatGPT plan connection can no longer be refreshed. Ask the user to sign in again."],
    ["refresh_token_invalidated", "revoked", "This ChatGPT plan connection was disconnected. Ask the user to sign in again."],
    ["invalid_client", "revoked", "This ChatGPT plan connection was disconnected. Ask the user to sign in again."],
  ];
  it.each(ends)("a refresh refused with %s is %s", async (code, reason, message) => {
    const session = await signIn();
    const before = await record();
    fake.refreshFailure = { status: code === "invalid_client" ? 401 : 400, body: { error: code } };
    const e = await refreshPlan(session, { store, endpoints: fake.endpoints }).catch((x) => x);
    expect(e).toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({ code: "connection_ended", reason, grantId: session.grantId, provider: "openai", message });
    // The dead tokens are gone. The registration stays, unless OpenAI no longer knows the client.
    const after = await record();
    expect(after.accessToken).toBeUndefined();
    expect(after.refreshToken).toBeUndefined();
    expect(after.hostId).toBe(before.hostId);
    expect(after.clientId).toBe(code === "invalid_client" ? undefined : before.clientId);
    expect(await restorePlan(who())).toBeNull();
  });

  it("a rotated-away refresh token is expired, the way OpenAI answers a reuse", async () => {
    const session = await signIn();
    const stale = await record();
    await refreshPlan(session, { store, endpoints: fake.endpoints });
    await store.save(stale); // another copy of the app wrote its old record back
    await expect(refreshPlan(session, { store, endpoints: fake.endpoints })).rejects.toMatchObject({ reason: "expired" });
  });

  it("a temporary failure is not an end and leaves the sign-in alone", async () => {
    const session = await signIn();
    const before = await record();
    for (const failure of [{ status: 503, body: { error: "temporarily_unavailable" } }, { status: 500, body: null }, { status: 400, body: { error: "something_new" } }]) {
      fake.refreshFailure = failure;
      const e = await refreshPlan(session, { store, endpoints: fake.endpoints }).catch((x) => x);
      expect(e).toBeInstanceOf(OutletError);
      expect(e).not.toBeInstanceOf(ConnectionEndedError);
      expect(e).toMatchObject({ code: "plan_refresh_failed", status: failure.status });
    }
    expect(await record()).toEqual(before);
  });

  it("a refresh that comes back without plan use is revoked, and the rotated token is still saved", async () => {
    const session = await signIn();
    const before = await record();
    fake.scope = "email offline_access openid profile";
    await expect(refreshPlan(session, { store, endpoints: fake.endpoints })).rejects.toMatchObject({ reason: "revoked" });
    expect((await record()).refreshToken).not.toBe(before.refreshToken);
  });

  it("nothing saved to refresh is expired", async () => {
    const session = await signIn();
    await store.clear();
    await expect(refreshPlan(session, { store, endpoints: fake.endpoints })).rejects.toMatchObject({ reason: "expired", grantId: session.grantId });
  });
});

describe("planModels()", () => {
  it("returns the models OpenAI lists for the account, in its order", async () => {
    const session = await signIn();
    expect(await planModels(session, { endpoints: fake.endpoints })).toEqual([
      { slug: "gpt-big", displayName: "GPT Big", description: "The large one." },
      { slug: "gpt-small", displayName: "GPT Small" },
    ]);
    expect(fake.requests.at(-1)!.headers.authorization).toBe(`Bearer ${session.keys.openai}`);
  });
  it("a refusal is an error that carries no token; the limit is the typed end", async () => {
    const session = await signIn();
    fake.models = { status: 401, body: { error: { code: "invalid_api_key", message: `Incorrect API key provided: ${session.keys.openai}` } } };
    const e = await planModels(session, { endpoints: fake.endpoints }).catch((x) => x);
    expect(e).toMatchObject({ code: "plan_models_failed", status: 401, message: "OpenAI did not return the model list (401)." });
    expect(`${e.message} ${e.stack}`).not.toContain(session.keys.openai);
    fake.models = { status: 429, body: { error: { code: "subscription_sharing_usage_limit_exceeded" } } };
    await expect(planModels(session, { endpoints: fake.endpoints })).rejects.toMatchObject({ reason: "capped" });
    fake.models = { status: 200, body: { models: [] } };
  });
});

describe("forgetPlan()", () => {
  it("ends the renewable session at OpenAI, then deletes the local record", async () => {
    await signIn();
    const saved = await record();
    expect(await forgetPlan(who())).toEqual({ revoked: true });
    const form = fake.requests.filter((r) => r.path === "/revoke").at(-1)!.form;
    expect(Object.fromEntries(form)).toEqual({ token: saved.refreshToken, token_type_hint: "refresh_token", client_id: saved.clientId });
    expect(await store.load()).toBeNull();
    expect(await restorePlan(who())).toBeNull();
  });
  it("still deletes the local record when OpenAI does not confirm, and says so", async () => {
    await signIn();
    fake.revokeStatus = 400;
    expect(await forgetPlan(who())).toEqual({ revoked: false });
    expect(await store.load()).toBeNull();
  });
  it("with nothing saved there is nothing to end", async () => {
    const before = fake.requests.length;
    expect(await forgetPlan(who())).toEqual({ revoked: false });
    expect(fake.requests.length).toBe(before);
  });
});
