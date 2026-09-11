// @vitest-environment jsdom
/** The Direct door through the real DOM: every screen, every error, the
 *  hand-off, the bound button. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_KEY, cleanup, click, deferred, flush, heading, input, mount, nameOf, overlayHost, paste,
  sheet, state, trigger,
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

describe("the Direct walk", () => {
  it("choose → provider → entry → guide → paste, with the words in place", () => {
    const { handle } = mount();
    handle.open();
    expect(state()).toBe("choose");
    expect(heading()).toBe("Connect your AI");
    click("Direct");
    expect(state()).toBe("direct-provider");
    expect(Array.from(sheet().querySelectorAll<HTMLElement>("button.provider")).map((b) => nameOf(b)))
      .toEqual(["OpenAI", "Anthropic", "Google"]);
    click("OpenAI");
    expect(state()).toBe("direct-openai-entry");
    expect(sheet().textContent).toContain("OpenAI API credits are billed separately from ChatGPT.");
    click("Get my Direct API key");
    expect(state()).toBe("direct-openai-guide");
    const steps = Array.from(sheet().querySelectorAll("ol li")).map((li) => li.textContent?.trim());
    expect(steps).toEqual(["Open the OpenAI website", "Create a Direct API key.", "Copy it and return here."]);
    const link = sheet().querySelector("ol a") as HTMLAnchorElement;
    expect(link.href).toBe("https://platform.openai.com/api-keys");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    const guide = sheet().querySelector("a.guide") as HTMLAnchorElement;
    expect(guide.textContent?.trim()).toBe("Full Direct guide");
    expect(guide.href).toBe("https://useoutlet.dev/docs/users/openai-api-key.html");
    click("Paste my Direct API key");
    expect(state()).toBe("direct-openai-paste");
    expect(sheet().querySelector("label")?.textContent).toBe("Direct API key · OpenAI");
    const field = input();
    expect(field.type).toBe("password");
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(field.placeholder).toBe("Paste your Direct API key");
    expect(sheet().textContent).toContain("Never sent to Outlet.");
  });

  it("Google gets a link pill and the Google full guide, no numbered steps", () => {
    const { handle } = mount();
    handle.open();
    click("Direct");
    click("Google");
    expect(state()).toBe("direct-google-entry");
    expect(sheet().textContent).not.toContain("billed separately");
    click("Get my Direct API key");
    expect(state()).toBe("direct-google-guide");
    expect(sheet().querySelector("ol")).toBeNull();
    const pill = sheet().querySelector("a.provider-link") as HTMLAnchorElement;
    expect(pill.textContent?.trim()).toBe("Open the Google website");
    expect(pill.href).toBe("https://aistudio.google.com/api-keys");
    expect((sheet().querySelector("a.guide") as HTMLAnchorElement).href).toBe("https://ai.google.dev/gemini-api/docs/api-key");
    click("Paste my Direct API key");
    expect(state()).toBe("direct-google-paste");
  });

  it("Anthropic entry names Claude subscriptions and its guide links the Anthropic website", () => {
    const { handle } = mount();
    handle.open();
    click("Direct");
    click("Anthropic");
    expect(sheet().textContent).toContain("Anthropic API credits are billed separately from Claude subscriptions.");
    click("Get my Direct API key");
    expect((sheet().querySelector("ol a") as HTMLAnchorElement).href).toBe("https://platform.claude.com/settings/keys");
  });

  it("one Direct provider skips the list; Back from its entry goes to choose", () => {
    const { handle } = mount({ providers: ["anthropic"] });
    handle.open();
    click("Direct");
    expect(state()).toBe("direct-anthropic-entry");
    click("Back");
    expect(state()).toBe("choose");
  });

  it("direct mode with one provider opens the entry with no Back", () => {
    const { handle } = mount({ mode: "direct", providers: ["google"] });
    handle.open();
    expect(state()).toBe("direct-google-entry");
    expect(sheet().querySelector('[aria-label="Back"]')).toBeNull();
  });
});

describe("the field is cleared when the flow is left", () => {
  it("Close clears it", () => {
    const m = toPaste();
    const field = input();
    field.value = OPENAI_KEY;
    m.handle.close();
    expect(field.value).toBe("");
    expect(overlayHost()).toBeNull();
  });
  it("Back clears it", () => {
    toPaste();
    const field = input();
    field.value = OPENAI_KEY;
    click("Back");
    expect(field.value).toBe("");
    expect(state()).toBe("direct-openai-entry");
  });
  it("Escape and destroy clear it", () => {
    const m = toPaste();
    let field = input();
    field.value = OPENAI_KEY;
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    expect(field.value).toBe("");
    expect(overlayHost()).toBeNull();
    m.handle.open();
    click("Direct"); click("OpenAI"); click("I have my Direct API key");
    field = input();
    field.value = OPENAI_KEY;
    m.handle.destroy();
    expect(field.value).toBe("");
  });
  it("closing during the hand-off still binds the button once it resolves", async () => {
    const d = deferred<void>();
    const m = toPaste();
    m.onSession.mockReturnValue(d.promise);
    paste(OPENAI_KEY);
    await flush();
    m.handle.close();
    d.resolve();
    await flush();
    expect(overlayHost()).toBeNull();
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · OpenAI");
  });
});
