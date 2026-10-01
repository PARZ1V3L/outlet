/**
 * connectPlan() against a fake OpenAI on the loopback: the sign-in as
 * OpenAI's page gives it, and the security list of the plan entry. No live
 * call. Each security line names its number from the list.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OutletError } from "../../src/index.js";
import { connectPlan, planFileStore, type ConnectPlanOptions, type PlanStore } from "../../src/plan/index.js";
import { type Fake, type IdTokenFault, fakeOpenAI, visit } from "./fake-openai.js";

let fake: Fake;
let dir: string;
let store: PlanStore & { path: string };
let landed: Promise<{ status: number; page: string; callback: string }> | null;
const logged: string[] = [];

const options = (extra: Partial<ConnectPlanOptions> = {}): ConnectPlanOptions => ({
  provider: "openai",
  appName: "Test App",
  store,
  endpoints: fake.endpoints,
  port: 0,
  timeoutMs: 5000,
  open: (url) => { landed = visit(url); },
  ...extra,
});
let exchanges = 0;
/** Token calls since this test began. */
const exchanged = () => fake.count("/token") - exchanges;
const authorizeQuery = (n = -1) => fake.requests.filter((r) => r.path === "/authorize").at(n)!.query;

beforeAll(async () => { fake = await fakeOpenAI(); });
afterAll(() => fake.close());
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "outlet-plan-"));
  store = planFileStore("Test App", { dir });
  landed = null;
  exchanges = fake.count("/token");
  fake.authorize = "approve";
  fake.idTokenFault = null;
  fake.tokenFailure = null;
  fake.scope = "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke";
  fake.sub = "user-sub-1";
  logged.length = 0;
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("the first sign-in", () => {
  it("registers the app, exchanges the code and returns the same session shape", async () => {
    const session = await connectPlan(options());
    const q = authorizeQuery();
    expect(q.get("client_id")).toBe("dynamic_agent_client");
    expect(q.get("agent_name_hint")).toBe("Test App");
    expect(q.get("ext_agent_host_id")).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(q.get("response_type")).toBe("code");
    expect(q.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    expect(q.get("scope")).toBe("openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
    expect(q.get("resource")).toBe(fake.endpoints.api);
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.has("id_token_hint")).toBe(false);

    const exchange = fake.requests.find((r) => r.path === "/token")!.form;
    expect([...exchange.keys()].sort()).toEqual(["client_id", "code", "code_verifier", "grant_type", "redirect_uri", "resource"]);
    expect(exchange.get("client_id")).toMatch(/^oaiapp_/);
    expect(exchange.get("redirect_uri")).toBe(q.get("redirect_uri"));

    const record = (await store.load())!;
    expect(session).toEqual({
      grantId: expect.stringMatching(/^plan_/),
      keys: { openai: record.accessToken },
      capUsd: Number.POSITIVE_INFINITY,
      expiresAt: record.expiresAt,
      mode: "plan",
      appName: "Test App",
    });
    expect(Date.parse(session.expiresAt) - Date.now()).toBeGreaterThan(3590_000);
    expect(Date.parse(session.expiresAt) - Date.now()).toBeLessThanOrEqual(3600_000);
    // The refresh token lives in the store, not on the session object.
    expect(record.refreshToken).toMatch(/^rt_/);
    expect(JSON.stringify(session)).not.toContain(record.refreshToken);
    expect(JSON.stringify(session)).not.toContain(record.idToken);
    expect(record).toMatchObject({ provider: "openai", appName: "Test App", hostId: q.get("ext_agent_host_id"), clientId: exchange.get("client_id"), subject: "user-sub-1", email: "user@example.com", issuer: fake.endpoints.issuer });
  });

  it("security 7: the page the browser lands on holds no token", async () => {
    await connectPlan(options());
    const page = await landed!;
    expect(page.status).toBe(200);
    expect(page.page).toContain("<p>You're signed in. You can close this tab.</p>");
    for (const token of fake.issued) expect(page.page).not.toContain(token);
    const record = (await store.load())!;
    expect(page.page).not.toContain(record.clientId);
  });

  it("the host id is kept before the browser opens", async () => {
    let before: unknown;
    await connectPlan(options({ open: async (url) => { before = await store.load(); landed = visit(url); } }));
    expect(before).toMatchObject({ provider: "openai", appName: "Test App", hostId: authorizeQuery().get("ext_agent_host_id") });
    expect((before as { clientId?: string }).clientId).toBeUndefined();
  });
});

describe("a later sign-in", () => {
  it("reuses the registration and the host id, and sends the saved account's hints", async () => {
    await connectPlan(options());
    const first = authorizeQuery();
    const saved = (await store.load())!;
    await connectPlan(options());
    const again = authorizeQuery();
    expect(again.get("client_id")).toBe(saved.clientId);
    expect(again.has("agent_name_hint")).toBe(false);
    expect(again.get("ext_agent_host_id")).toBe(first.get("ext_agent_host_id"));
    expect(again.get("id_token_hint")).toBe(saved.idToken);
    expect(again.get("login_hint")).toBe("user@example.com");
  });

  it("security 1: every attempt has a fresh state, nonce and PKCE verifier", async () => {
    await connectPlan(options());
    await connectPlan(options());
    const [a, b] = [authorizeQuery(-2), authorizeQuery(-1)];
    for (const name of ["state", "nonce", "code_challenge"]) {
      expect(a.get(name)).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a.get(name)).not.toBe(b.get(name));
    }
    const verifiers = fake.requests.filter((r) => r.path === "/token").slice(-2).map((r) => r.form.get("code_verifier"));
    expect(verifiers[0]).not.toBe(verifiers[1]);
  });

  it("a different account on a saved registration is refused before anything is replaced", async () => {
    await connectPlan(options());
    const saved = await store.load();
    fake.sub = "user-sub-2";
    await expect(connectPlan(options())).rejects.toMatchObject({ code: "plan_other_account" });
    expect(await store.load()).toEqual(saved);
  });

  it("a callback that names another client is refused", async () => {
    await connectPlan(options());
    const saved = await store.load();
    fake.authorize = "other_client";
    await expect(connectPlan(options())).rejects.toMatchObject({ code: "plan_sign_in_failed" });
    expect(await store.load()).toEqual(saved);
  });
});

describe("the callback", () => {
  it("security 1: a callback whose state does not match ends the attempt", async () => {
    fake.authorize = "wrong_state";
    const e = await connectPlan(options()).catch((x) => x);
    expect(e).toBeInstanceOf(OutletError);
    expect(e).toMatchObject({ code: "state_mismatch", message: "State mismatch. Possible CSRF; aborting." });
    const page = await landed!;
    expect(page.status).toBe(400);
    expect(page.page).toContain("<p>Sign-in did not finish. Go back to the app and try again.</p>");
    // No code was exchanged, and nothing but the host id was kept.
    expect(exchanged()).toBe(0);
    const record = (await store.load())!;
    expect(record.clientId).toBeUndefined();
    expect(record.accessToken).toBeUndefined();
    // The listener is gone: the same address no longer answers.
    await expect(fetch(page.callback)).rejects.toThrow();
  });

  it("the user declining is its own error, and no code is exchanged", async () => {
    fake.authorize = "deny";
    await expect(connectPlan(options())).rejects.toMatchObject({ code: "plan_declined", message: "The user did not approve the sign-in at OpenAI." });
    expect(exchanged()).toBe(0);
    expect((await landed!).status).toBe(400);
  });

  it("a first registration with no issued client id is incomplete", async () => {
    fake.authorize = "no_client";
    await expect(connectPlan(options())).rejects.toMatchObject({ code: "plan_sign_in_failed" });
    expect(exchanged()).toBe(0);
  });

  it("a callback with no code ends the attempt", async () => {
    fake.authorize = "no_code";
    await expect(connectPlan(options())).rejects.toMatchObject({ code: "plan_sign_in_failed" });
  });

  it("a refused exchange keeps the registration for the next attempt and saves no token", async () => {
    fake.tokenFailure = { status: 400, body: { error: "invalid_grant" } };
    await expect(connectPlan(options())).rejects.toMatchObject({
      code: "plan_sign_in_failed", status: 400, message: "OpenAI did not finish the sign-in (invalid_grant). Call connectPlan() again.",
    });
    const record = (await store.load())!;
    expect(record.clientId).toMatch(/^oaiapp_/);
    expect(record.accessToken).toBeUndefined();
    expect(record.refreshToken).toBeUndefined();
    expect((await landed!).status).toBe(400);
  });
});

describe("security 3: the ID token and the plan permission", () => {
  const faults: [IdTokenFault, string][] = [
    ["signature", "signature"], ["kid", "signature"], ["alg", "signature"],
    ["issuer", "issuer"], ["audience", "audience"], ["expiry", "expiry"], ["nonce", "nonce"],
  ];
  it.each(faults)("an ID token with a bad %s fails its %s check and nothing is saved", async (fault, check) => {
    fake.idTokenFault = fault;
    const e = await connectPlan(options()).catch((x) => x);
    expect(e).toBeInstanceOf(OutletError);
    expect(e).toMatchObject({ code: "plan_id_token", message: `OpenAI's ID token did not pass its ${check} check. The sign-in was not saved.` });
    const record = (await store.load())!;
    expect(record.accessToken).toBeUndefined();
    expect(record.refreshToken).toBeUndefined();
    expect(record.idToken).toBeUndefined();
    expect((await landed!).status).toBe(400);
  });

  it("a valid ID token alone is not plan permission: the granted scopes must include plan use", async () => {
    fake.scope = "email offline_access openid profile";
    await expect(connectPlan(options())).rejects.toMatchObject({
      code: "plan_use_not_granted", message: "The user signed in but did not allow ChatGPT plan use. Offer a Direct API key or Vault.",
    });
    const record = (await store.load())!;
    expect(record.accessToken).toBeUndefined();
    expect(record.refreshToken).toBeUndefined();
  });
});

describe("security 4: no token in a log, an error or a thrown message", () => {
  it("every failure above says nothing a token is made of", async () => {
    const thrown: string[] = [];
    const attempt = async () => { thrown.push(await connectPlan(options()).then(() => "", (e) => `${e.message} ${e.code} ${e.stack}`)); };
    await attempt();
    // An answer that echoes secrets back must not reach the message either.
    fake.tokenFailure = { status: 400, body: { error: "invalid_grant", error_description: `bad code ${fake.issued.join(" ")}` } };
    await attempt();
    fake.tokenFailure = { status: 400, body: { error: `leak ${fake.issued[0]}` } };
    await attempt();
    fake.tokenFailure = null;
    for (const fault of ["signature", "nonce", "audience"] as const) {
      fake.idTokenFault = fault;
      await attempt();
    }
    fake.idTokenFault = null;
    fake.scope = "openid";
    await attempt();
    expect(fake.issued.length).toBeGreaterThan(8);
    for (const token of fake.issued) {
      for (const text of [...thrown, ...logged]) expect(text).not.toContain(token);
    }
    // The entry prints nothing at all.
    expect(logged).toEqual([]);
    expect(thrown[2]).toContain("OpenAI did not finish the sign-in (unknown).");
  });
});

describe("the options", () => {
  it("another provider and a missing app name are refused before anything opens", async () => {
    const open = vi.fn();
    await expect(connectPlan(options({ provider: "anthropic" as "openai", open }))).rejects.toMatchObject({
      code: "plan_provider", message: 'ChatGPT plan sign-in works with OpenAI only. Pass provider: "openai".',
    });
    await expect(connectPlan(options({ appName: " ", open }))).rejects.toMatchObject({ code: "plan_app_name" });
    expect(open).not.toHaveBeenCalled();
  });
});
