/**
 * The loopback listener of connectPlan(), against the fake OpenAI: security
 * 2 of the plan entry's list. It binds 127.0.0.1 only, on the path OpenAI
 * gives, and closes after one callback or a timeout.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectPlan, planFileStore, type ConnectPlanOptions, type PlanStore } from "../../src/plan/index.js";
import { type Fake, fakeOpenAI, visit } from "./fake-openai.js";

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

describe("security 2: the listener", () => {
  it("answers only the callback path, on 127.0.0.1, and closes after one callback", async () => {
    let seen = "";
    const session = await connectPlan(options({
      open: async (url) => {
        const redirect = new URL(new URL(url).searchParams.get("redirect_uri")!);
        seen = redirect.host;
        // Another path, and the page's own path under another host name: neither is the callback.
        expect((await fetch(`${redirect.origin}/callback?code=x&state=y`)).status).toBe(404);
        expect((await fetch(`${redirect.origin}/`)).status).toBe(404);
        expect((await fetch(`http://localhost:${redirect.port}/auth/callback?code=x&state=y`).then((r) => r.status, () => 404))).toBe(404);
        expect((await fetch(redirect.toString(), { method: "POST" })).status).toBe(404);
        landed = visit(url);
      },
    }));
    expect(session.mode).toBe("plan");
    expect(seen).toMatch(/^127\.0\.0\.1:\d+$/);
    await expect(fetch((await landed!).callback)).rejects.toThrow();
  });

  it("is not reachable on another address of this machine", async () => {
    let refused: boolean | null = null;
    await connectPlan(options({
      open: async (url) => {
        const port = Number(new URL(new URL(url).searchParams.get("redirect_uri")!).port);
        refused = await new Promise<boolean>((resolve) => {
          const socket = connect({ host: "::1", port });
          socket.once("connect", () => { socket.destroy(); resolve(false); });
          socket.once("error", () => resolve(true));
        });
        landed = visit(url);
      },
    }));
    expect(refused).toBe(true);
  });

  it("closes on the timeout", async () => {
    let callback = "";
    const e = await connectPlan(options({
      timeoutMs: 60,
      open: (url) => { callback = new URL(url).searchParams.get("redirect_uri")!; },
    })).catch((x) => x);
    expect(e).toMatchObject({ code: "plan_sign_in_timeout", message: "The ChatGPT sign-in did not finish in time. Call connectPlan() again." });
    await expect(fetch(`${callback}?code=x&state=y`)).rejects.toThrow();
  });

  it("closes on the caller's signal", async () => {
    const stop = new AbortController();
    let callback = "";
    const pending = connectPlan(options({ signal: stop.signal, open: (url) => { callback = new URL(url).searchParams.get("redirect_uri")!; } }));
    setTimeout(() => stop.abort(), 30);
    await expect(pending).rejects.toMatchObject({ code: "plan_sign_in_aborted" });
    await expect(fetch(`${callback}?code=x&state=y`)).rejects.toThrow();
  });

  it("a named port that is taken is an error, and the default moves to a free port", async () => {
    const blocker = createServer();
    const taken = await new Promise<number>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve((blocker.address() as { port: number }).port)));
    await expect(connectPlan(options({ port: taken }))).rejects.toMatchObject({
      code: "plan_port_busy", message: `Port ${taken} on 127.0.0.1 is in use. Pass another port, or leave port out.`,
    });
    blocker.close();
    // Hold 1455 if it is free, then sign in with no port named.
    const first = createServer();
    const held = await new Promise<boolean>((resolve) => {
      first.once("error", () => resolve(false));
      first.listen(1455, "127.0.0.1", () => resolve(true));
    });
    try {
      const { port: _unset, ...unnamed } = options();
      await connectPlan(unnamed);
      const port = Number(new URL(authorizeQuery().get("redirect_uri")!).port);
      expect(port).toBeGreaterThan(0);
      expect(port).not.toBe(1455);
    } finally {
      if (held) first.close();
    }
  });
});
