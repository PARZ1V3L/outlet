// @vitest-environment jsdom
/** Connection ends in the Connect your AI button (NEVER-DEAD-END
 *  2026-09-26): the capped, ended and refused screens, one action each,
 *  the return from the account page, and what the button ignores. The
 *  core announces an end on the page; refresh() and connectRedirect()
 *  are stubbed, nothing leaves. */
import { afterEach, describe, expect, it, vi } from "vitest";
import Outlet, { type OutletSession } from "../../src/index.js";
import { ENDED_EVENT, ended } from "../../src/ended.js";
import { refresh } from "../../src/grants.js";
import { connectRedirect } from "../../src/pkce.js";
import {
  OPENAI_KEY, activeInSheet, cleanup, click, deferred, flush, heading, live, mount, overlayHost, paste,
  sheet, state, trigger,
} from "./helpers.js";

vi.mock("../../src/pkce.js", async (original) => ({
  ...(await original<typeof import("../../src/pkce.js")>()),
  connectRedirect: vi.fn(async () => undefined),
}));
vi.mock("../../src/grants.js", async (original) => ({
  ...(await original<typeof import("../../src/grants.js")>()),
  refresh: vi.fn(),
}));
const refreshMock = vi.mocked(refresh);
const redirect = vi.mocked(connectRedirect);

const held: OutletSession & { refreshToken: string } = {
  grantId: "grant_1", keys: { openai: "sk-scoped" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z", mode: "vault", refreshToken: "rt_1",
};
const raised = { ...held, keys: { openai: "sk-scoped-2" }, capUsd: 20, refreshToken: "rt_2" };
const directHeld: OutletSession = {
  grantId: "direct_1", keys: { openai: "sk-proj-old" }, capUsd: Infinity, expiresAt: "9999-12-31T23:59:59Z", mode: "direct",
};

const link = (label: string) =>
  Array.from(sheet().querySelectorAll("a")).find((a) => a.textContent?.trim() === label) as HTMLAnchorElement;
/** jsdom cannot navigate: the link's default action is stopped, the widget's own listener still runs. */
const noNavigation = () => document.addEventListener("click", (e) => e.preventDefault(), true);
const back = () => window.dispatchEvent(new Event("focus"));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("capped", () => {
  it("status() saying capped opens the capped screen on the button that holds the grant, in place", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      grantId: "grant_1", status: "capped", providers: ["openai"], capUsd: 5, spendUsd: 5.02, reason: "spend",
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    expect(overlayHost()).toBeNull();
    await expect(Outlet.status("grant_1", { refreshToken: "rt_1" })).rejects.toMatchObject({ reason: "capped" });
    expect(state()).toBe("vault-capped");
    expect(heading()).toBe("This Vault connection is paused at its cap");
    expect(live()).toBe("This Vault connection is paused at its cap");
    expect(sheet().textContent).toContain("Vault · OpenAI");
    expect(sheet().querySelector('[aria-label="Back"]')).toBeNull();
    expect(sheet().querySelector(".tile.off")).toBeNull();
    const raise = link("Raise the Vault cap");
    expect(raise.href).toBe("https://useoutlet.dev/account/");
    expect(raise.target).toBe("_blank");
    expect(raise.rel).toBe("noopener noreferrer");
    expect(raise.className).toBe("primary");
    expect(activeInSheet()).toBe(raise);
    expect(sheet().querySelectorAll("button.primary, a.primary")).toHaveLength(1);
    // paused, not gone: the button stays Connected
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
  });

  it("the return: checking, one refresh with the session's token, onSession gets the new session, Connected", async () => {
    noNavigation();
    const m = mount({ mode: "vault", providers: ["openai"], session: held, baseUrl: "https://api.example/v0" });
    ended("capped", "grant_1", { provider: "openai" });
    const d = deferred<OutletSession>();
    refreshMock.mockReturnValue(d.promise as never);
    link("Raise the Vault cap").click();
    expect(refreshMock).not.toHaveBeenCalled();
    back();
    expect(state()).toBe("vault-return-checking");
    expect(heading()).toBe("Checking your Vault connection");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledWith("grant_1", { refreshToken: "rt_1", baseUrl: "https://api.example/v0" });
    back();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    d.resolve(raised);
    await flush();
    expect(m.onSession).toHaveBeenCalledTimes(1);
    expect(m.onSession).toHaveBeenCalledWith(raised);
    expect(state()).toBe("vault-connected");
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
    m.handle.close();
    m.handle.open();
    expect(state()).toBe("vault-connected");
    // the next end refreshes with the rotated token the button delivered
    ended("capped", "grant_1", { provider: "openai" });
    refreshMock.mockResolvedValue(raised as never);
    link("Raise the Vault cap").click();
    back();
    expect(refreshMock).toHaveBeenLastCalledWith("grant_1", { refreshToken: "rt_2", baseUrl: "https://api.example/v0" });
  });

  it("still capped on the return: the capped screen again, nothing handed over", async () => {
    noNavigation();
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    ended("capped", "grant_1", { provider: "openai" });
    refreshMock.mockImplementation(async () => { throw ended("capped", "grant_1", { status: 409 }); });
    link("Raise the Vault cap").click();
    back();
    await flush();
    expect(state()).toBe("vault-capped");
    expect(m.onSession).not.toHaveBeenCalled();
    expect(m.onError).not.toHaveBeenCalled();
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
    expect(link("Raise the Vault cap")).toBeDefined();
  });

  it("revoked on the return: the ended screen and the idle button", async () => {
    noNavigation();
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    ended("capped", "grant_1", { provider: "openai" });
    refreshMock.mockImplementation(async () => { throw ended("revoked", "grant_1", { status: 409 }); });
    link("Raise the Vault cap").click();
    back();
    await flush();
    expect(state()).toBe("vault-ended");
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connect your AI");
  });

  it("a vault failure on the return is reported and the capped screen returns", async () => {
    noNavigation();
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    ended("capped", "grant_1", { provider: "openai" });
    refreshMock.mockRejectedValue(new Error("vault down"));
    link("Raise the Vault cap").click();
    back();
    await flush();
    expect(m.onError).toHaveBeenCalledTimes(1);
    expect(state()).toBe("vault-capped");
    expect(m.onSession).not.toHaveBeenCalled();
  });

  it("an onSession that throws on the return shows the return error", async () => {
    noNavigation();
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    m.onSession.mockRejectedValue(new Error("no"));
    ended("capped", "grant_1", { provider: "openai" });
    refreshMock.mockResolvedValue(raised as never);
    link("Raise the Vault cap").click();
    back();
    await flush();
    expect(state()).toBe("vault-return-error");
    expect(m.onError).toHaveBeenCalledTimes(1);
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
  });

  it("without a refresh token the button cannot refresh: the screen stays", async () => {
    noNavigation();
    const { refreshToken: _, ...noToken } = held;
    mount({ mode: "vault", providers: ["openai"], session: noToken });
    ended("capped", "grant_1", { provider: "openai" });
    link("Raise the Vault cap").click();
    back();
    await flush();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(state()).toBe("vault-capped");
  });

  it("coming back before the link was used does nothing; a hidden tab is not a return", () => {
    noNavigation();
    mount({ mode: "vault", providers: ["openai"], session: held });
    ended("capped", "grant_1", { provider: "openai" });
    back();
    expect(refreshMock).not.toHaveBeenCalled();
    link("Raise the Vault cap").click();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refreshMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("the same end twice keeps the screen in place", () => {
    mount({ mode: "vault", providers: ["openai"], session: held });
    ended("capped", "grant_1", { provider: "openai" });
    const h1 = sheet().querySelector("h1");
    ended("capped", "grant_1", { provider: "openai" });
    expect(sheet().querySelector("h1")).toBe(h1);
    expect(state()).toBe("vault-capped");
  });
});

describe("ended", () => {
  it("revoked: the line, grey eyes, the idle button, and Connect again runs the grant", () => {
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    ended("revoked", "grant_1", { provider: "openai" });
    expect(state()).toBe("vault-ended");
    expect(heading()).toBe("This Vault connection has ended");
    expect(live()).toBe("This Vault connection has ended");
    expect(sheet().querySelector(".tile.off")).not.toBeNull();
    expect(sheet().querySelector('[aria-label="Back"]')).toBeNull();
    expect(sheet().querySelectorAll("button.primary, a.primary")).toHaveLength(1);
    const b = trigger(m.target);
    expect(b.className).toBe("fixed-button");
    expect(b.getAttribute("aria-label")).toBe("Connect your AI");
    expect(activeInSheet()?.textContent?.trim()).toBe("Connect again");
    click("Connect again");
    expect(state()).toBe("vault-leaving");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0]![0].providers).toEqual(["openai"]);
  });

  it("expired: the same screen; closed and reopened it stays until a new session", () => {
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    ended("expired", "grant_1", { provider: "openai" });
    expect(state()).toBe("vault-ended");
    m.handle.close();
    expect(overlayHost()).toBeNull();
    m.handle.open();
    expect(state()).toBe("vault-ended");
  });

  it("an Anthropic connection ends under its own header", () => {
    mount({ providers: ["anthropic", "openai"], session: { ...held, keys: { anthropic: "sk-scoped" } } });
    ended("revoked", "grant_1", { provider: "anthropic" });
    expect(state()).toBe("vault-anthropic-ended");
    expect(sheet().textContent).toContain("Vault · Anthropic");
  });
});

describe("refused (Direct)", () => {
  it("the line names the provider; one button back to the paste screen; a new key connects again", async () => {
    const m = mount({ mode: "direct", providers: ["openai"], session: directHeld });
    ended("refused", "direct_1", { provider: "openai" });
    expect(state()).toBe("direct-openai-refused");
    expect(heading()).toBe("OpenAI refused your Direct API key");
    expect(live()).toBe("OpenAI refused your Direct API key");
    expect(sheet().textContent).toContain("Direct · OpenAI");
    expect(sheet().querySelector(".tile.off")).not.toBeNull();
    expect(sheet().querySelector('[aria-label="Back"]')).toBeNull();
    expect(sheet().querySelectorAll("button.primary, a.primary")).toHaveLength(1);
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connect your AI");
    expect(activeInSheet()?.textContent?.trim()).toBe("Paste a new Direct API key");
    click("Paste a new Direct API key");
    expect(state()).toBe("direct-openai-paste");
    const d = deferred<void>();
    m.onSession.mockReturnValue(d.promise);
    paste(OPENAI_KEY);
    await flush();
    expect(state()).toBe("direct-openai-checking");
    d.resolve();
    await flush();
    expect(state()).toBe("direct-openai-connected");
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
    m.handle.close();
    m.handle.open();
    expect(state()).toBe("direct-openai-connected");
  });

  it("a described provider gets the same screen with its own name", () => {
    mount({ mode: "direct", providers: [{ id: "runway", name: "Runway", keysUrl: "https://dev.runwayml.com/" }],
      session: { ...directHeld, keys: { runway: "rw_x" } } });
    ended("refused", "direct_1", { provider: "runway" });
    expect(state()).toBe("direct-runway-refused");
    expect(heading()).toBe("Runway refused your Direct API key");
  });

  it("the wrapper's refusal reaches the button without a line in the app", async () => {
    mount({ mode: "direct", providers: ["openai"], session: directHeld });
    const wrapped = Outlet.wrapFetch({ session: directHeld, fetch: async () => new Response("", { status: 401 }) });
    await expect(wrapped("https://api.openai.com/v1/responses")).rejects.toMatchObject({ reason: "refused" });
    expect(state()).toBe("direct-openai-refused");
  });
});

describe("not its business", () => {
  it("another grant's end, an unbound button, a destroyed button and a stray event change nothing", () => {
    const m = mount({ mode: "vault", providers: ["openai"], session: held });
    ended("revoked", "grant_2", { provider: "openai" });
    expect(overlayHost()).toBeNull();
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
    document.dispatchEvent(new CustomEvent(ENDED_EVENT, { detail: { code: "connection_ended" } }));
    expect(overlayHost()).toBeNull();
    cleanup();
    mount();
    ended("capped", "grant_1", { provider: "openai" });
    expect(overlayHost()).toBeNull();
    cleanup();
    const gone = mount({ mode: "vault", providers: ["openai"], session: held });
    gone.handle.destroy();
    ended("capped", "grant_1", { provider: "openai" });
    expect(overlayHost()).toBeNull();
  });
});
