// @vitest-environment jsdom
/** The Vault door: explain, the same-tab redirect, the return page
 *  and its failures. connectRedirect() is stubbed; nothing leaves. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectRedirect } from "../../src/pkce.js";
import type { OutletSession } from "../../src/index.js";
import {
  activeInSheet, cleanup, click, deferred, flush, heading, live, mount, overlayHost, overlayRoot,
  sheet, state, trigger,
} from "./helpers.js";

vi.mock("../../src/pkce.js", () => ({ connectRedirect: vi.fn() }));
const redirect = vi.mocked(connectRedirect);

const vaultSession: OutletSession = {
  grantId: "grant_1",
  keys: { openai: "sk-scoped-openai" },
  capUsd: 10,
  expiresAt: "2026-10-01T00:00:00Z",
  mode: "vault",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("explain", () => {
  it("both: Vault explains OpenAI with the fine print and Continue", () => {
    const { handle } = mount();
    handle.open();
    click("Vault");
    expect(state()).toBe("vault-explain");
    expect(heading()).toBe("Connect your account");
    expect(sheet().textContent).toContain("Use your Vault admin key on useoutlet.dev.");
    expect(sheet().textContent).toContain("Vault caps use provider spend reports.");
    expect(sheet().textContent).not.toContain("by hand");
    expect(sheet().querySelector('[aria-label="Back"]')).not.toBeNull();
  });
  it("names one provider: the first Vault-capable one in the list", () => {
    const { handle } = mount({ providers: ["google", "anthropic", "openai"] });
    handle.open();
    click("Vault");
    expect(state()).toBe("vault-anthropic-explain");
    expect(sheet().textContent).toContain("Make the Anthropic Vault App key by hand.");
    expect(sheet().querySelectorAll("button.provider")).toHaveLength(0);
  });
  it("vault only: no Back, the -only screens", () => {
    const a = mount({ mode: "vault", providers: ["openai"] });
    a.handle.open();
    expect(state()).toBe("vault-only");
    expect(sheet().querySelector('[aria-label="Back"]')).toBeNull();
    cleanup();
    const b = mount({ mode: "vault", providers: ["anthropic"] });
    b.handle.open();
    expect(state()).toBe("vault-anthropic-only");
  });
});

describe("Continue to Outlet", () => {
  it("shows leaving and starts the same-tab redirect with the one provider", async () => {
    const d = deferred<never>();
    redirect.mockReturnValue(d.promise as never);
    const m = mount({ requestedCapUsd: 7, baseUrl: "https://api.example/v0" });
    m.handle.open();
    click("Vault");
    click("Continue to Outlet");
    expect(state()).toBe("vault-leaving");
    expect(heading()).toBe("Opening Outlet");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0]![0]).toEqual({
      appId: "app_test",
      providers: ["openai"],
      redirectUri: "https://app.example/outlet/return",
      requestedCapUsd: 7,
      baseUrl: "https://api.example/v0",
    });
    const button = sheet().querySelector("button.primary") as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe("Continue to Outlet");
    expect(button.disabled).toBe(true);
    expect(trigger(m.target).className).toBe("fixed-button");
    d.resolve(undefined as never);
    await flush();
    expect(button.disabled).toBe(false);
  });
  it("a failed start keeps the leaving screen with its button as the retry, and reports", async () => {
    redirect.mockRejectedValueOnce(new Error("vault down"));
    const m = mount();
    m.handle.open();
    click("Vault");
    click("Continue to Outlet");
    await flush();
    expect(state()).toBe("vault-leaving");
    expect(m.onError).toHaveBeenCalledTimes(1);
    const button = sheet().querySelector("button.primary") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    redirect.mockResolvedValueOnce(undefined as never);
    button.click();
    await flush();
    expect(redirect).toHaveBeenCalledTimes(2);
    expect(state()).toBe("vault-leaving");
    expect(trigger(m.target).className).toBe("fixed-button");
  });
  it("a failed retry gives focus back to the retry when the disabled button dropped it", async () => {
    const m = mount();
    m.handle.open();
    click("Vault");
    redirect.mockResolvedValueOnce(undefined as never);
    click("Continue to Outlet");
    await flush();
    const button = sheet().querySelector("button.primary") as HTMLButtonElement;
    button.focus();
    redirect.mockImplementationOnce(async () => {
      // what a browser does when the focused button turns disabled
      (overlayRoot().activeElement as HTMLElement | null)?.blur();
      throw new Error("vault down");
    });
    button.click();
    await flush();
    expect(m.onError).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(false);
    expect(overlayRoot().activeElement).toBe(button);
  });
  it("Anthropic leaves through its own screens", () => {
    redirect.mockResolvedValue(undefined as never);
    const m = mount({ providers: ["anthropic"] });
    m.handle.open();
    click("Vault");
    click("Continue to Outlet");
    expect(state()).toBe("vault-anthropic-leaving");
    expect(redirect.mock.calls[0]![0].providers).toEqual(["anthropic"]);
  });
});

describe("the return page", () => {
  it("a pending handleRedirect(): checking, then onSession, then connected and the bound button", async () => {
    const d = deferred<OutletSession>();
    const m = mount({ mode: "vault", providers: ["openai"], session: d.promise });
    expect(state()).toBe("vault-return-checking");
    expect(heading()).toBe("Checking your Vault connection");
    expect(live()).toBe("Checking your Vault connection");
    expect(activeInSheet()?.getAttribute("aria-label")).toBe("Close");
    expect(sheet().querySelector('[aria-label="Back"]')).toBeNull();
    expect(trigger(m.target).className).toBe("fixed-button");
    d.resolve(vaultSession);
    await flush();
    expect(m.onSession).toHaveBeenCalledWith(vaultSession);
    expect(state()).toBe("vault-connected");
    expect(heading()).toBe("Connected to OpenAI");
    expect(activeInSheet()?.textContent?.trim()).toBe("Done");
    // the hosted page winked before the return: no second wink here
    expect(sheet().querySelector(".wink")).toBeNull();
    const manage = sheet().querySelector("a.provider-link") as HTMLAnchorElement;
    expect(manage.textContent?.trim()).toBe("Manage Vault access");
    expect(manage.href).toBe("https://useoutlet.dev/account/");
    const b = trigger(m.target);
    expect(b.textContent?.trim()).toBe("Connected · OpenAI");
    expect(b.getAttribute("aria-label")).toBe("Connected to OpenAI in Vault");
    click("Done");
    expect(overlayHost()).toBeNull();
    m.handle.open();
    expect(state()).toBe("vault-connected");
  });
  it("a rejected return: the return-error state, a fresh attempt, no Connected", async () => {
    const d = deferred<OutletSession>();
    redirect.mockResolvedValue(undefined as never);
    const m = mount({ mode: "vault", providers: ["anthropic"], session: d.promise });
    expect(state()).toBe("vault-anthropic-return-checking");
    d.reject(new Error("state_mismatch"));
    await flush();
    expect(state()).toBe("vault-anthropic-return-error");
    expect(heading()).toBe("Vault is not connected");
    expect(m.onError).toHaveBeenCalledTimes(1);
    expect(m.onSession).not.toHaveBeenCalled();
    expect(trigger(m.target).className).toBe("fixed-button");
    click("Return to Outlet");
    expect(state()).toBe("vault-anthropic-leaving");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
  it("the button never turns Connected when onSession rejects on the return", async () => {
    const m = mount({ mode: "vault", providers: ["openai"], session: Promise.resolve(vaultSession) });
    m.onSession.mockRejectedValue(new Error("no"));
    await flush();
    expect(state()).toBe("vault-return-error");
    expect(trigger(m.target).className).toBe("fixed-button");
  });
  it("a held session mounts the Connected button, sheet closed", () => {
    const m = mount({ mode: "vault", providers: ["openai"], session: vaultSession });
    expect(overlayHost()).toBeNull();
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connected to OpenAI in Vault");
    expect(m.onSession).not.toHaveBeenCalled();
    m.handle.open();
    expect(state()).toBe("vault-connected");
  });
  it("a held Vault session binds the provider its key names, not the first in the list", () => {
    const m = mount({ providers: ["openai", "anthropic"], session: { ...vaultSession, keys: { anthropic: "sk-scoped-anthropic" } } });
    const b = trigger(m.target);
    expect(b.textContent?.trim()).toBe("Connected · Anthropic");
    expect(b.getAttribute("aria-label")).toBe("Connected to Anthropic in Vault");
    m.handle.open();
    expect(state()).toBe("vault-anthropic-connected");
    expect(heading()).toBe("Connected to Anthropic");
    expect(sheet().textContent).toContain("Vault · Anthropic");
  });
  it("a mode-less session with only a Google key binds nothing: the Vault has no Google door", () => {
    const m = mount({ session: { ...vaultSession, mode: undefined, keys: { google: "AIzaX" } } });
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connect your AI");
    m.handle.open();
    expect(state()).toBe("choose");
  });
  it("a held Direct session binds Direct", () => {
    const m = mount({ session: { ...vaultSession, mode: "direct", keys: { google: "AIzaX" } } });
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connected to Google in Direct");
    m.handle.open();
    expect(state()).toBe("direct-google-connected");
  });
});
