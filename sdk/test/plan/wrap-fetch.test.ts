/**
 * A plan session in the rest of the SDK, against the fake OpenAI's Responses
 * answers with each error code: the fetch wrapper, the helper for a failure
 * inside a stream, and what must not break for the vault calls and the
 * Connect your AI button.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Outlet, { ConnectionEndedError, OutletError, type OutletSession } from "../../src/index.js";
import { connectPlan, planFileStore, planStreamEnd, type PlanSession, type PlanStore } from "../../src/plan/index.js";
import { boundFrom } from "../../src/ui/config.js";
import type { Config } from "../../src/ui/routes.js";
import { type Fake, fakeOpenAI, visit } from "./fake-openai.js";

let fake: Fake;
let dir: string;
let store: PlanStore & { path: string };
const who = () => ({ provider: "openai" as const, appName: "Test App", store, endpoints: fake.endpoints });
const signIn = () => connectPlan({ ...who(), port: 0, timeoutMs: 5000, open: (url) => { void visit(url); } });
beforeAll(async () => { fake = await fakeOpenAI(); });
afterAll(() => fake.close());
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "outlet-plan-"));
  store = planFileStore("Test App", { dir });
  fake.responses = { status: 200, body: { ok: true } };
  fake.scope = "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe("wrapFetch() on a plan session", () => {
  let session: PlanSession;
  const call = (spy?: typeof fetch) =>
    Outlet.wrapFetch({ session: () => session, ...(spy ? { fetch: spy } : {}) })(`${fake.endpoints.api}/responses`, { method: "POST", body: "{}" });
  const openaiError = (code: string) => ({ error: { message: "OpenAI's words", type: "invalid_request_error", param: null, code } });
  beforeEach(async () => { session = await signIn(); });

  it("OpenAI's limit is capped", async () => {
    fake.responses = { status: 429, body: openaiError("subscription_sharing_usage_limit_exceeded") };
    const e = await call().catch((x) => x);
    expect(e).toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({
      reason: "capped", grantId: session.grantId, provider: "openai", status: 429,
      message: "This ChatGPT plan connection reached its limit. The user can raise it in ChatGPT settings.",
    });
  });

  it("an account OpenAI does not allow is refused", async () => {
    fake.responses = { status: 403, body: openaiError("subscription_sharing_user_not_eligible") };
    const e = await call().catch((x) => x);
    expect(e).toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({
      reason: "refused", status: 403, message: "OpenAI does not allow plan use on this account. Offer a Direct API key or Vault.",
    });
  });

  const passes: [string, number, unknown][] = [
    ["subscription_sharing_usage_unavailable", 503, openaiError("subscription_sharing_usage_unavailable")],
    ["subscription_sharing_user_unavailable", 503, openaiError("subscription_sharing_user_unavailable")],
    ["subscription_sharing_unsupported_capability", 400, openaiError("subscription_sharing_unsupported_capability")],
    ["subscription_sharing_route_not_supported", 403, openaiError("subscription_sharing_route_not_supported")],
    ["subscription_sharing_invalid_user", 401, openaiError("subscription_sharing_invalid_user")],
    ["chatpass_v2_scope_not_authorized", 403, openaiError("chatpass_v2_scope_not_authorized")],
    ["chatpass_v2_invalid_authorization_context", 403, openaiError("chatpass_v2_invalid_authorization_context")],
    ["invalid_api_key", 401, openaiError("invalid_api_key")],
    ["a detail body with no code", 401, { detail: "Not accepted" }],
    ["a detail body with no code", 403, { detail: "Region not permitted" }],
    ["a body that is not JSON", 429, undefined],
    ["a code named like an object key", 429, openaiError("constructor")],
  ];
  it.each(passes)("%s (%i) is not an end and passes through untouched", async (_name, status, body) => {
    fake.responses = { status, body };
    const res = await call();
    expect(res.status).toBe(status);
    expect(res.bodyUsed).toBe(false);
    if (body !== undefined) expect(await res.json()).toEqual(body);
  });

  it("never calls the vault, never reads a request, never reads an answer that succeeded", async () => {
    const urls: string[] = [];
    const real = globalThis.fetch;
    const clone = vi.spyOn(Response.prototype, "clone");
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { urls.push(input instanceof Request ? input.url : String(input)); return real(input, init); });
    vi.stubGlobal("fetch", spy);
    const wrapped = Outlet.wrapFetch({ session });
    // A request whose body can be read once: the wrapper must leave it for the fetch underneath.
    const request = new Request(`${fake.endpoints.api}/responses`, { method: "POST", body: "{}" });
    const ok = await wrapped(request);
    // The fetch underneath could still send the body: had the wrapper read it, this would have thrown.
    expect(ok.status).toBe(200);
    expect(clone).not.toHaveBeenCalled();
    expect(ok.bodyUsed).toBe(false);
    for (const [status, code] of [[429, "subscription_sharing_usage_limit_exceeded"], [401, "subscription_sharing_invalid_user"], [403, "x"]] as const) {
      fake.responses = { status, body: openaiError(code) };
      await wrapped(`${fake.endpoints.api}/responses`, { method: "POST", body: "{}" }).catch(() => undefined);
    }
    expect(urls.length).toBe(4);
    for (const url of urls) expect(url.startsWith(fake.origin)).toBe(true);
    expect(urls.some((u) => u.includes("useoutlet"))).toBe(false);
  });
});

describe("planStreamEnd()", () => {
  const session = { grantId: "plan_abc" };
  it("a response.failed event with OpenAI's limit code is capped", () => {
    const e = planStreamEnd({ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "x" } } }, session);
    expect(e).toBeInstanceOf(ConnectionEndedError);
    expect(e).toMatchObject({ reason: "capped", grantId: "plan_abc", provider: "openai" });
    expect(planStreamEnd({ type: "response.failed", response: { error: { code: "subscription_sharing_user_not_eligible" } } }, session)).toMatchObject({ reason: "refused" });
  });
  it("a temporary failure and every other event are not an end", () => {
    for (const event of [
      { type: "response.failed", response: { error: { code: "subscription_sharing_usage_unavailable" } } },
      { type: "response.failed", response: { error: null } },
      { type: "response.failed" },
      { type: "response.completed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } },
      { type: "response.output_text.delta", delta: "hi" },
      null, undefined, "response.failed", 7,
    ]) expect(planStreamEnd(event, session)).toBeNull();
  });
});

describe("what must not break", () => {
  it("refresh(), status() and revoke() on a plan_ id refuse with directions", async () => {
    const session = await signIn();
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    for (const call of [Outlet.refresh(session.grantId), Outlet.status(session.grantId), Outlet.revoke(session.grantId)]) {
      const e = await call.catch((x) => x);
      expect(e).toBeInstanceOf(OutletError);
      expect(e).toMatchObject({
        code: "plan_session",
        message: "This is a ChatGPT plan session: there is no vault grant behind it. Use refreshPlan() to renew it.",
      });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("the Connect your AI button never binds a plan session: boundFrom answers null", async () => {
    const session = await signIn();
    const cfg = { mode: "both", direct: ["openai"], vault: "openai", custom: {} } as unknown as Config;
    expect(boundFrom(session, cfg)).toBeNull();
    // By its id alone too, should the mode be lost on the way.
    const { mode: _mode, ...bare } = session;
    expect(boundFrom(bare as OutletSession, cfg)).toBeNull();
    // The same keys as a Vault session still bind, so the null above is the plan's.
    expect(boundFrom({ ...bare, grantId: "grant_1", mode: "vault" }, cfg)).toMatchObject({ mode: "vault", provider: "openai" });
  });
});
