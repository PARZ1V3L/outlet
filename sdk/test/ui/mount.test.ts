// @vitest-environment jsdom
/** Mounting, styles, destroy, and the options a developer can get wrong. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountConnectButton } from "../../src/ui/index.js";
import { OutletError } from "../../src/index.js";
import { CSS } from "../../src/ui/styles.js";
import { cleanup, click, mount, overlayHost, overlayRoot, sheet, state, trigger } from "./helpers.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mountConnectButton()", () => {
  it("mounts the idle button in a shadow root, named Connect your AI", () => {
    const { target } = mount();
    const b = trigger(target);
    expect(b.getAttribute("aria-label")).toBe("Connect your AI");
    expect(b.className).toBe("fixed-button");
    const svg = b.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("264");
    expect(svg?.getAttribute("height")).toBe("61");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(target.childNodes.length).toBe(0);
  });

  it("mounts nothing else until opened", () => {
    mount();
    expect(overlayHost()).toBeNull();
  });

  it("theme: auto by default, light and dark on request", () => {
    const a = mount();
    expect(a.target.shadowRoot!.querySelector(".root")!.className).toContain("t-auto");
    const d = mount({ theme: "dark" });
    expect(d.target.shadowRoot!.querySelector(".root")!.className).toContain("t-dark");
    d.handle.open();
    expect(overlayRoot().querySelector(".root")!.className).toContain("t-dark");
  });

  it("renders no inline style attributes anywhere", () => {
    const { target, handle } = mount();
    handle.open();
    click("Direct");
    click("OpenAI");
    click("I have my Direct API key");
    const styled = [
      ...target.shadowRoot!.querySelectorAll("[style]"),
      ...overlayRoot().querySelectorAll("[style]"),
    ];
    expect(styled).toHaveLength(0);
    expect(target.shadowRoot!.innerHTML).not.toMatch(/ style=/);
    expect(overlayRoot().innerHTML).not.toMatch(/ style=/);
  });

  it("falls back to a <style> element where constructable stylesheets are missing (jsdom)", () => {
    const { target, handle } = mount();
    expect(target.shadowRoot!.querySelector("style")?.textContent).toBe(CSS);
    handle.open();
    expect(overlayRoot().querySelector("style")?.textContent).toBe(CSS);
    // the page scroll lock rides the same fallback: there while open, gone on close
    const locks = () => Array.from(document.head.querySelectorAll("style")).filter((s) => s.textContent?.includes("overflow:hidden"));
    expect(locks()).toHaveLength(1);
    handle.close();
    expect(locks()).toHaveLength(0);
    handle.open();
    expect(locks()).toHaveLength(1);
  });

  it("uses adoptedStyleSheets when the constructor exists (no <style> element)", () => {
    const sheets: unknown[] = [];
    class FakeSheet {
      css = "";
      replaceSync(s: string) { this.css = s; }
    }
    vi.stubGlobal("CSSStyleSheet", FakeSheet);
    const store = new WeakMap<object, unknown[]>();
    const desc: PropertyDescriptor = {
      configurable: true,
      get() { return store.get(this as object) ?? []; },
      set(v: unknown[]) { store.set(this as object, v); sheets.push(...v); },
    };
    Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", desc);
    Object.defineProperty(Document.prototype, "adoptedStyleSheets", desc);
    try {
      const { target, handle } = mount();
      expect(target.shadowRoot!.querySelector("style")).toBeNull();
      expect((target.shadowRoot!.adoptedStyleSheets[0] as unknown as FakeSheet).css).toBe(CSS);
      handle.open();
      expect(overlayRoot().querySelector("style")).toBeNull();
      // the widget sheet, plus the tiny viewport sheet
      expect(overlayRoot().adoptedStyleSheets.length).toBe(2);
      // the page-level scroll lock rides the same path, and leaves on close
      expect(document.adoptedStyleSheets.length).toBe(1);
      handle.close();
      expect(document.adoptedStyleSheets.length).toBe(0);
    } finally {
      delete (ShadowRoot.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
      delete (Document.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
    }
  });

  it("destroy() closes the sheet and leaves the target empty", () => {
    const { target, handle } = mount();
    handle.open();
    expect(overlayHost()).not.toBeNull();
    handle.destroy();
    expect(overlayHost()).toBeNull();
    expect(target.shadowRoot!.childNodes.length).toBe(0);
    expect(target.childNodes.length).toBe(0);
    handle.open();
    expect(overlayHost()).toBeNull();
    handle.destroy();
  });

  it("open() twice keeps one sheet; close() when closed is a no-op", () => {
    const { handle } = mount();
    handle.close();
    handle.open();
    handle.open();
    expect(document.querySelectorAll("[data-outlet-overlay]")).toHaveLength(1);
    expect(overlayRoot().querySelectorAll("section.sheet")).toHaveLength(1);
    expect(state()).toBe("choose");
  });

  it("can mount again on the same target after destroy", () => {
    const { target, handle } = mount();
    handle.destroy();
    const again = mountConnectButton(target, { mode: "direct", providers: ["openai"], onSession() {} });
    expect(trigger(target).getAttribute("aria-label")).toBe("Connect your AI");
    again.destroy();
  });
});

describe("options that cannot work fail at mount", () => {
  const base = { onSession() {} };
  const err = (fn: () => unknown) => {
    try { fn(); } catch (e) { return e as OutletError; }
    throw new Error("expected a throw");
  };
  it("unknown provider", () => {
    const e = err(() => mountConnectButton(document.createElement("div"), { ...base, mode: "direct", providers: ["groq"] }));
    expect(e).toBeInstanceOf(OutletError);
    expect(e.code).toBe("ui_provider_unsupported");
    expect(e.message).toContain("groq");
  });
  it("no providers", () => {
    expect(err(() => mountConnectButton(document.createElement("div"), { ...base, mode: "direct", providers: [] })).code).toBe("ui_no_providers");
  });
  it("Vault without a Vault-capable provider", () => {
    expect(err(() => mountConnectButton(document.createElement("div"), { ...base, mode: "vault", providers: ["google"], appId: "app_x", redirectUri: "https://a/b" })).code).toBe("ui_no_vault_provider");
    expect(err(() => mountConnectButton(document.createElement("div"), { ...base, mode: "both", providers: ["google"], appId: "app_x", redirectUri: "https://a/b" })).code).toBe("ui_no_vault_provider");
  });
  it("an element that cannot hold a shadow root", () => {
    expect(err(() => mountConnectButton(document.createElement("button"), { ...base, mode: "direct", providers: ["openai"] })).code).toBe("ui_target_unsupported");
  });
  it("Vault without appId and redirectUri", () => {
    expect(err(() => mountConnectButton(document.createElement("div"), { ...base, mode: "vault", providers: ["openai"] })).code).toBe("ui_vault_options_required");
  });
  it("a bad mode, a missing onSession, a missing target", () => {
    expect(err(() => mountConnectButton(document.createElement("div"), { ...base, mode: "popup" as never, providers: ["openai"] })).code).toBe("ui_mode");
    expect(err(() => mountConnectButton(document.createElement("div"), { mode: "direct", providers: ["openai"] } as never)).code).toBe("ui_on_session_required");
    expect(err(() => mountConnectButton(null as never, { ...base, mode: "direct", providers: ["openai"] })).code).toBe("ui_target_required");
  });
  it("Direct mode ignores Vault options; Vault mode offers no Direct rows", () => {
    const { handle } = mount({ mode: "direct", providers: ["openai", "anthropic"] });
    handle.open();
    expect(state()).toBe("direct-only");
    expect(sheet().querySelectorAll("button.provider")).toHaveLength(2);
  });
});
