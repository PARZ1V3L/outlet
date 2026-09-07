/**
 * status() hits the dedicated /status endpoint (NEXT-WORK 8b): a pure read
 * returning GrantInfo, never key material. Pinning the URL matters — the
 * old code called GET /grants/:id, which made the vault decrypt and
 * re-deliver the full scoped key on every status poll (security review).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { status } from "../src/index.js";

const wireInfo = {
  grantId: "grant_1",
  status: "active",
  providers: ["openai"],
  capUsd: 5,
  spendUsd: 1.37,
};

function mockFetch(body: unknown, statusCode = 200) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: statusCode,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("status()", () => {
  it("calls /grants/:id/status (never the key-delivering poll route)", async () => {
    const fn = mockFetch(wireInfo);
    const info = await status("grant_1", { appSecret: "apps_x" });
    expect(info).toEqual(wireInfo);
    const [url] = fn.mock.calls[0] as unknown as [string];
    expect(url).toContain("/grants/grant_1/status");
  });

  it("authenticates public clients with the grant bearer token", async () => {
    const fn = mockFetch(wireInfo);
    await status("grant_1", { refreshToken: "rt_1" });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer rt_1");
  });
});
