// @vitest-environment jsdom
/** Keyboard and screen readers: the dialog, focus, the trap, announcements. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_KEY, activeInSheet, cleanup, click, deferred, flush, key, live, mount, overlayHost,
  overlayRoot, paste, sheet, state, trigger,
} from "./helpers.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the dialog", () => {
  it("is labelled by its heading, which takes focus on open and on every step", () => {
    const { handle } = mount();
    handle.open();
    const s = sheet();
    expect(s.getAttribute("role")).toBe("dialog");
    expect(s.getAttribute("aria-modal")).toBe("true");
    const h1 = s.querySelector("h1") as HTMLElement;
    expect(s.getAttribute("aria-labelledby")).toBe(h1.id);
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(activeInSheet()).toBe(h1);
    click("Direct");
    expect(activeInSheet()).toBe(sheet().querySelector("h1"));
    click("Back");
    expect(activeInSheet()).toBe(sheet().querySelector("h1"));
    expect(state()).toBe("choose");
  });

  it("names Close and Back; each mode choice is one button described by its explanation", () => {
    const { handle } = mount();
    handle.open();
    const close = sheet().querySelector('[aria-label="Close"]');
    expect(close?.tagName).toBe("BUTTON");
    const choices = sheet().querySelectorAll("button.choice");
    expect(choices).toHaveLength(2);
    const direct = choices[0] as HTMLElement;
    const name = sheet().querySelector("#" + direct.getAttribute("aria-labelledby"));
    const desc = sheet().querySelector("#" + direct.getAttribute("aria-describedby"));
    expect(name?.textContent).toBe("Direct");
    expect(desc?.textContent).toBe("Use your API key to connect.");
    expect(sheet().querySelector(".arrow")?.getAttribute("aria-hidden")).toBe("true");
    click("Direct");
    expect(sheet().querySelector('[aria-label="Back"]')?.tagName).toBe("BUTTON");
  });

  it("marks every SVG decorative and labels the lockup Outlet", () => {
    const { target, handle } = mount();
    handle.open();
    const svgs = [...target.shadowRoot!.querySelectorAll("svg"), ...overlayRoot().querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThan(3);
    for (const s of svgs) {
      expect(s.getAttribute("aria-hidden")).toBe("true");
      expect(s.getAttribute("focusable")).toBe("false");
    }
    const lockup = sheet().querySelector('[role="img"]');
    expect(lockup?.getAttribute("aria-label")).toBe("Outlet");
  });

  it("traps Tab and Shift+Tab inside the sheet", () => {
    const { handle } = mount();
    handle.open();
    const controls = Array.from(sheet().querySelectorAll<HTMLElement>("button, a[href]"));
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    last.focus();
    expect(activeInSheet()).toBe(last);
    const tab = key(last, "Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(activeInSheet()).toBe(first);
    const back = key(first, "Tab", true);
    expect(back.defaultPrevented).toBe(true);
    expect(activeInSheet()).toBe(last);
    // from the heading, Tab takes the first control after it, Shift+Tab the last before it
    const h1 = sheet().querySelector("h1") as HTMLElement;
    h1.focus();
    expect(key(h1, "Tab").defaultPrevented).toBe(true);
    expect(activeInSheet()?.getAttribute("aria-labelledby")).toBe("outlet-choose-direct-name");
    h1.focus();
    expect(key(h1, "Tab", true).defaultPrevented).toBe(true);
    expect(activeInSheet()?.getAttribute("aria-label")).toBe("Close");
  });

  it("keeps Tab inside on a screen whose only control sits above the heading", async () => {
    const d = deferred<void>();
    const m = mount();
    m.onSession.mockReturnValue(d.promise);
    m.handle.open();
    click("Direct");
    click("OpenAI");
    click("I have my Direct API key");
    paste(OPENAI_KEY);
    await flush();
    expect(state()).toBe("direct-openai-checking");
    const h1 = sheet().querySelector("h1") as HTMLElement;
    h1.focus();
    expect(key(h1, "Tab").defaultPrevented).toBe(true);
    const close = activeInSheet() as HTMLElement;
    expect(close.getAttribute("aria-label")).toBe("Close");
    expect(key(close, "Tab").defaultPrevented).toBe(true);
    expect(activeInSheet()).toBe(close);
    expect(key(close, "Tab", true).defaultPrevented).toBe(true);
    expect(activeInSheet()).toBe(close);
    d.resolve();
    await flush();
  });

  it("makes the page behind inert, restores it on close, and returns focus to the trigger", () => {
    const other = document.createElement("main");
    document.body.appendChild(other);
    const already = document.createElement("aside");
    already.setAttribute("inert", "");
    document.body.appendChild(already);
    const { target, handle } = mount();
    handle.open();
    expect(other.hasAttribute("inert")).toBe(true);
    expect(target.hasAttribute("inert")).toBe(true);
    expect(overlayHost()!.hasAttribute("inert")).toBe(false);
    handle.close();
    expect(other.hasAttribute("inert")).toBe(false);
    expect(target.hasAttribute("inert")).toBe(false);
    expect(already.hasAttribute("inert")).toBe(true);
    expect(target.shadowRoot!.activeElement).toBe(trigger(target));
  });

  it("Escape closes the sheet only, and does not reach the page", () => {
    const { handle } = mount();
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    handle.open();
    const h1 = sheet().querySelector("h1") as HTMLElement;
    key(h1, "Escape");
    expect(overlayHost()).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    document.removeEventListener("keydown", seen);
  });

  it("the veil closes the sheet", () => {
    const { handle } = mount();
    handle.open();
    (overlayRoot().querySelector(".veil") as HTMLElement).click();
    expect(overlayHost()).toBeNull();
  });

  it("pulls focus back when it lands outside the overlay", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const { handle } = mount();
    handle.open();
    outside.removeAttribute("inert");
    outside.focus();
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
    expect(activeInSheet()).toBe(sheet().querySelector("h1"));
  });

  it("announces checking and connected politely, once each, without re-entering the dialog", async () => {
    const region = () => overlayRoot().querySelector('[role="status"]') as HTMLElement;
    const d = deferred<void>();
    const m = mount();
    m.onSession.mockReturnValue(d.promise);
    m.handle.open();
    const dialog = sheet();
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(live()).toBe("");
    click("Direct");
    click("OpenAI");
    click("I have my Direct API key");
    expect(sheet()).toBe(dialog);
    expect(live()).toBe("");
    const announced: string[] = [];
    const append = vi.spyOn(region(), "appendChild");
    append.mockImplementation(function (this: Node, n: Node) {
      announced.push(n.textContent ?? "");
      return Node.prototype.appendChild.call(this, n);
    });
    paste(OPENAI_KEY);
    await flush();
    expect(state()).toBe("direct-openai-checking");
    expect(sheet()).toBe(dialog);
    expect(activeInSheet()?.getAttribute("aria-label")).toBe("Close");
    d.resolve();
    await flush();
    expect(state()).toBe("direct-openai-connected");
    expect(sheet()).toBe(dialog);
    expect(activeInSheet()?.textContent?.trim()).toBe("Done");
    expect(announced).toEqual(["Checking the format", "Connected to OpenAI"]);
    expect(region().childNodes).toHaveLength(1);
  });

  it("the paste field is labelled, masked, and free of autocomplete", () => {
    const { handle } = mount();
    handle.open();
    click("Direct");
    click("OpenAI");
    click("I have my Direct API key");
    const input = sheet().querySelector("input") as HTMLInputElement;
    const label = sheet().querySelector("label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(input.id);
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("follows the visual viewport through a stylesheet, never a style attribute", () => {
    const listeners: Record<string, () => void> = {};
    const vv = {
      offsetTop: 40, height: 500,
      addEventListener: (n: string, f: () => void) => { listeners[n] = f; },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("visualViewport", vv);
    const { handle } = mount();
    handle.open();
    const dyn = overlayRoot().querySelectorAll("style")[1] as HTMLStyleElement;
    expect(dyn.textContent).toBe(".overlay{--vv-top:40px;--vv-height:500px}");
    vv.height = 320;
    listeners.resize!();
    expect(dyn.textContent).toBe(".overlay{--vv-top:40px;--vv-height:320px}");
    expect(overlayRoot().querySelector("[style]")).toBeNull();
    handle.close();
    expect(vv.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
