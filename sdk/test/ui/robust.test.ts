// @vitest-environment jsdom
/** The sheet in harder pages: a modal <dialog> where the browser has one,
 *  Escape from anywhere, two sheets at once, a host the page removed, a
 *  foreign shadow root, an onError that throws, sessions that are not
 *  what they seem. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountConnectButton } from "../../src/ui/index.js";
import type { OutletSession } from "../../src/index.js";
import {
  OPENAI_KEY, cleanup, click, flush, mount, overlayHost, overlayRoot, paste, sheet, state, trigger,
} from "./helpers.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const escape = () =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

/** jsdom has no showModal(); stand in for a browser that has one. */
function withModalDialogs(): () => void {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  return () => { delete proto.showModal; delete proto.close; };
}

const dialogEl = () => overlayRoot().querySelector("dialog.overlay") as HTMLDialogElement;

describe("a modal <dialog> where the browser has one", () => {
  it("is the one dialog, named by the heading, and leaves the page's attributes alone", () => {
    const restore = withModalDialogs();
    try {
      const main = document.createElement("main");
      document.body.appendChild(main);
      const { handle } = mount();
      handle.open();
      expect(dialogEl().hasAttribute("open")).toBe(true);
      expect(dialogEl().getAttribute("aria-labelledby")).toBe("outlet-title");
      expect(sheet().hasAttribute("role")).toBe(false);
      expect(sheet().hasAttribute("aria-modal")).toBe(false);
      expect(main.hasAttribute("inert")).toBe(false);
      expect(overlayRoot().activeElement).toBe(sheet().querySelector("h1"));
      click("Direct");
      expect(sheet().hasAttribute("role")).toBe(false);
      expect(overlayRoot().activeElement).toBe(sheet().querySelector("h1"));
    } finally {
      restore();
    }
  });

  it("Escape, its cancel, and a close the browser made itself all end in the widget's close", () => {
    const restore = withModalDialogs();
    try {
      const { target, handle } = mount();
      handle.open();
      escape();
      expect(overlayHost()).toBeNull();
      handle.open();
      const cancel = new Event("cancel", { cancelable: true });
      dialogEl().dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(overlayHost()).toBeNull();
      handle.open();
      dialogEl().close();
      expect(overlayHost()).toBeNull();
      expect(target.shadowRoot!.activeElement).toBe(trigger(target));
    } finally {
      restore();
    }
  });
});

describe("Escape from anywhere", () => {
  it("closes the sheet after a click on plain text dropped focus to the page body", () => {
    const { handle } = mount();
    handle.open();
    (overlayRoot().activeElement as HTMLElement).blur();
    expect(overlayRoot().activeElement).toBeNull();
    escape();
    expect(overlayHost()).toBeNull();
  });
});

describe("two sheets at once (the fallback layer)", () => {
  it("Escape closes the top one, and the page stays inert until the last one closes", () => {
    const main = document.createElement("main");
    document.body.appendChild(main);
    const a = mount({ mode: "direct", providers: ["openai"] });
    const b = mount({ mode: "direct", providers: ["anthropic"] });
    a.handle.open();
    b.handle.open();
    expect(document.querySelectorAll("[data-outlet-overlay]")).toHaveLength(2);
    escape();
    expect(document.querySelectorAll("[data-outlet-overlay]")).toHaveLength(1);
    expect(state()).toBe("direct-openai-entry");
    b.handle.open();
    a.handle.close();
    expect(main.hasAttribute("inert")).toBe(true);
    b.handle.close();
    expect(main.hasAttribute("inert")).toBe(false);
    expect(document.querySelectorAll("[data-outlet-overlay]")).toHaveLength(0);
  });
});

describe("a host the page removed", () => {
  it("heals on the next open and releases the page on close", () => {
    const main = document.createElement("main");
    document.body.appendChild(main);
    const { handle } = mount();
    handle.open();
    overlayHost()!.remove();
    handle.open();
    expect(overlayHost()).not.toBeNull();
    expect(state()).toBe("choose");
    handle.close();
    expect(overlayHost()).toBeNull();
    expect(main.hasAttribute("inert")).toBe(false);
  });
});

describe("a foreign shadow root", () => {
  it("is refused, and what it holds stays", () => {
    const el = document.createElement("div");
    const foreign = el.attachShadow({ mode: "open" });
    foreign.appendChild(document.createElement("slot"));
    let code = "";
    try {
      mountConnectButton(el, { mode: "direct", providers: ["openai"], onSession() {} });
    } catch (e) {
      code = (e as { code: string }).code;
    }
    expect(code).toBe("ui_target_unsupported");
    expect(foreign.childNodes).toHaveLength(1);
  });
});

describe("an onError that throws", () => {
  it("does not strand the sheet on a checking screen", async () => {
    const m = mount({ onError: () => { throw new Error("the app's handler"); } });
    m.onSession.mockRejectedValue(new Error("no"));
    m.handle.open();
    click("Direct");
    click("OpenAI");
    click("I have my Direct API key");
    paste(OPENAI_KEY);
    await flush();
    expect(state()).toBe("direct-error-handoff-error");
  });
});

describe("sessions that are not what they seem", () => {
  it("a malformed held session binds nothing and does not throw", () => {
    for (const session of [{ keys: null }, { keys: "sk-x" }, {}, { keys: { openai: "" } }, "a string"]) {
      const m = mount({ session: session as unknown as OutletSession });
      expect(trigger(m.target).getAttribute("aria-label")).toBe("Connect your AI");
      cleanup();
    }
  });

  it("a returned session with no key this button knows is a failed return, and never reaches onSession", async () => {
    const m = mount({
      mode: "vault",
      providers: ["openai"],
      session: Promise.resolve({ grantId: "g", keys: { google: "AIzaX" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z" } as OutletSession),
    });
    await flush();
    expect(state()).toBe("vault-return-error");
    expect(m.onSession).not.toHaveBeenCalled();
    expect(m.onError.mock.calls[0]![0]).toMatchObject({ code: "ui_session_unbound" });
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connect your AI");
  });
});
