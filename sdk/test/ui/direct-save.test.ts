// @vitest-environment jsdom
/** Save on the Direct paste screen: the good key, every error, the
 *  hand-off, the bound button, the one wink. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_KEY, GOOGLE_KEY, OPENAI_KEY, activeInSheet, cleanup, click, deferred, flush,
  heading, input, live, mount, overlayHost, paste, sheet, state, trigger,
} from "./helpers.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function toPaste(provider = "OpenAI") {
  const m = mount();
  m.handle.open();
  click("Direct");
  click(provider);
  click("I have my Direct API key");
  return m;
}

describe("Save", () => {
  it("a good key: checking, then connected only once onSession resolved, then the bound button", async () => {
    const d = deferred<void>();
    const m = toPaste();
    m.onSession.mockReturnValue(d.promise);
    paste(OPENAI_KEY);
    await flush();
    expect(state()).toBe("direct-openai-checking");
    expect(live()).toBe("Checking the format");
    expect(m.onSession).toHaveBeenCalledTimes(1);
    const session = m.onSession.mock.calls[0]![0];
    expect(session.keys.openai).toBe(OPENAI_KEY);
    expect(session.mode).toBe("direct");
    expect(trigger(m.target).className).toBe("fixed-button");
    d.resolve();
    await flush();
    expect(state()).toBe("direct-openai-connected");
    expect(heading()).toBe("Connected to OpenAI");
    expect(sheet().textContent).toContain("Only the format was checked.");
    expect(sheet().querySelector(".wink")).not.toBeNull();
    expect(live()).toBe("Connected to OpenAI");
    const b = trigger(m.target);
    expect(b.className).toBe("connected-button");
    expect(b.textContent?.trim()).toBe("Connected · OpenAI");
    expect(b.getAttribute("aria-label")).toBe("Connected to OpenAI in Direct");
    click("Done");
    expect(overlayHost()).toBeNull();
    expect(document.activeElement).toBe(m.target);
    expect(m.target.shadowRoot!.activeElement).toBe(b);
    m.handle.open();
    expect(state()).toBe("direct-openai-connected");
    // one wink per connection: a reopen shows the mark still
    expect(sheet().querySelector(".wink")).toBeNull();
  });

  it("Google and Anthropic bind their own names", async () => {
    const g = toPaste("Google");
    paste(GOOGLE_KEY);
    await flush();
    expect(state()).toBe("direct-google-connected");
    expect(trigger(g.target).getAttribute("aria-label")).toBe("Connected to Google in Direct");
    cleanup();
    const a = toPaste("Anthropic");
    paste(ANTHROPIC_KEY);
    await flush();
    expect(trigger(a.target).textContent?.trim()).toBe("Connected · Anthropic");
  });

  it("empty: the same field, focus in it, aria-invalid, no onSession", async () => {
    const m = toPaste();
    const field = input();
    paste("   ");
    await flush();
    expect(state()).toBe("direct-error-empty");
    expect(heading()).toBe("Paste your Direct API key");
    expect(input()).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(activeInSheet()).toBe(field);
    expect(sheet().querySelector(".explanation")?.hasAttribute("hidden")).toBe(true);
    expect(m.onSession).not.toHaveBeenCalled();
  });

  it("format: the error text is associated with the field and never echoes the key", async () => {
    const m = toPaste();
    const field = input();
    paste("not-a-key-zzz");
    await flush();
    expect(state()).toBe("direct-error-format");
    expect(heading()).toBe("Check your Direct API key");
    const err = sheet().querySelector("#outlet-error") as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe("Copy the whole OpenAI Direct API key and try again.");
    expect(field.getAttribute("aria-describedby")).toBe("outlet-error");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(activeInSheet()).toBe(field);
    // from the Save button, the focus move into the described field speaks: no second announcement
    expect(live()).toBe("");
    expect(sheet().textContent).not.toContain("not-a-key-zzz");
    expect(m.onSession).not.toHaveBeenCalled();
    // fixing it in the same field works
    paste(OPENAI_KEY);
    await flush();
    expect(state()).toBe("direct-openai-connected");
  });

  it("a field error submitted from inside the field is announced once, by the live region", async () => {
    toPaste();
    const field = input();
    field.focus();
    field.value = "not-a-key-zzz";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await flush();
    expect(state()).toBe("direct-error-format");
    expect(live()).toBe("Copy the whole OpenAI Direct API key and try again.");
    expect(activeInSheet()).toBe(field);
  });

  it("an empty submit after a format error drops the stale message", async () => {
    toPaste();
    paste("bad");
    await flush();
    expect(state()).toBe("direct-error-format");
    paste("");
    await flush();
    expect(state()).toBe("direct-error-empty");
    expect(heading()).toBe("Paste your Direct API key");
    const err = sheet().querySelector("#outlet-error") as HTMLElement;
    expect(err.hidden).toBe(true);
    expect(err.textContent).toBe("");
    expect(input().getAttribute("aria-describedby")).toBeNull();
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });

  it("wrong provider that the app supports: the hint state with the switch", async () => {
    const m = toPaste();
    const field = input();
    paste(ANTHROPIC_KEY);
    await flush();
    expect(state()).toBe("direct-error-wrong-provider");
    expect(field.value).toBe("");
    expect(heading()).toBe("This looks like Anthropic");
    expect(sheet().textContent).toContain("You chose OpenAI for Direct.");
    expect(sheet().textContent).not.toContain(ANTHROPIC_KEY);
    expect(m.onSession).not.toHaveBeenCalled();
    click("Use Anthropic in Direct");
    expect(state()).toBe("direct-anthropic-paste");
    expect(input().value).toBe("");
    click("Back");
    expect(state()).toBe("direct-anthropic-entry");
  });

  it("wrong provider: Try another returns to a cleared paste field", async () => {
    toPaste();
    const field = input();
    paste(GOOGLE_KEY);
    await flush();
    expect(heading()).toBe("This looks like Google");
    expect(field.value).toBe("");
    click("Try another Direct API key");
    expect(state()).toBe("direct-openai-paste");
    expect(input().value).toBe("");
  });

  it("wrong provider that the app does not support: the unsupported state", async () => {
    const m = mount({ providers: ["openai", "google"] });
    m.handle.open();
    click("Direct");
    click("OpenAI");
    click("I have my Direct API key");
    paste(ANTHROPIC_KEY);
    await flush();
    expect(state()).toBe("direct-error-unsupported");
    expect(heading()).toBe("This app does not offer Anthropic in Direct");
    click("Choose provider");
    expect(state()).toBe("direct-provider");
  });

  it("unsupported with one Direct provider returns to that provider's entry", async () => {
    const m = mount({ mode: "direct", providers: ["openai"] });
    m.handle.open();
    click("I have my Direct API key");
    paste(ANTHROPIC_KEY);
    await flush();
    expect(state()).toBe("direct-error-unsupported");
    click("Choose provider");
    expect(state()).toBe("direct-openai-entry");
  });

  it("admin keys are refused and never reach onSession; both modes offer Choose Vault", async () => {
    const m = toPaste();
    paste("sk-admin-abcdef123456");
    await flush();
    expect(state()).toBe("direct-error-admin-refused");
    expect(heading()).toBe("Vault admin keys don’t work in Direct");
    expect(m.onSession).not.toHaveBeenCalled();
    expect(sheet().textContent).not.toContain("sk-admin");
    click("Choose Vault");
    expect(state()).toBe("vault-explain");
  });

  it("an Anthropic admin key in the Anthropic field is refused too; Get my key goes to the guide", async () => {
    toPaste("Anthropic");
    paste("sk-ant-admin01-xyz");
    await flush();
    expect(state()).toBe("direct-error-admin-refused");
    click("Get my Direct API key");
    expect(state()).toBe("direct-anthropic-guide");
  });

  it("a single-mode app omits Choose Vault from the admin-key error", async () => {
    const m = mount({ mode: "direct", providers: ["openai"] });
    m.handle.open();
    click("I have my Direct API key");
    paste("sk-admin-abcdef123456");
    await flush();
    expect(state()).toBe("direct-error-admin-refused");
    expect(Array.from(sheet().querySelectorAll("button")).map((b) => b.textContent?.trim()))
      .not.toContain("Choose Vault");
  });

  it("onSession throwing shows the try-again state, reports the error, binds nothing", async () => {
    const m = toPaste();
    const field = input();
    m.onSession.mockRejectedValue(new Error("app failed"));
    paste(OPENAI_KEY);
    await flush();
    expect(field.value).toBe("");
    expect(state()).toBe("direct-error-handoff-error");
    expect(heading()).toBe("Couldn’t finish Direct");
    expect(m.onError).toHaveBeenCalledTimes(1);
    expect(trigger(m.target).className).toBe("fixed-button");
    click("Try again");
    expect(state()).toBe("direct-openai-paste");
    expect(input().value).toBe("");
  });

  it("Enter in the field saves", async () => {
    toPaste();
    input().value = OPENAI_KEY;
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await flush();
    expect(state()).toBe("direct-openai-connected");
  });
});
