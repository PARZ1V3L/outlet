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
      .toEqual(["OpenAI", "Anthropic", "Gemini"]);
    click("OpenAI");
    expect(state()).toBe("direct-openai-entry");
    expect(sheet().textContent).toContain("OpenAI API credits are billed separately from ChatGPT.");
    click("Get my Direct API key");
    expect(state()).toBe("direct-openai-guide");
    const steps = Array.from(sheet().querySelectorAll("ol li")).map((li) => li.textContent?.trim());
    expect(steps).toEqual(["Open the OpenAI website", "Create an API key. OpenAI calls it a secret key.", "Copy it and return here."]);
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

  it("google shows as Gemini on the same template: Google AI Studio steps and the Google full guide", () => {
    const { handle } = mount();
    handle.open();
    click("Direct");
    click("Gemini");
    expect(state()).toBe("direct-google-entry");
    expect(sheet().querySelector(".brand")?.textContent).toBe("Direct · Gemini");
    expect(sheet().textContent).not.toContain("billed separately");
    click("Get my Direct API key");
    expect(state()).toBe("direct-google-guide");
    const steps = Array.from(sheet().querySelectorAll("ol li")).map((li) => li.textContent?.trim());
    expect(steps).toEqual(["Open Google AI Studio", "Create an API key in Google AI Studio.", "Copy your Direct API key and return here."]);
    const pill = sheet().querySelector("ol a.guide-open") as HTMLAnchorElement;
    expect(pill.href).toBe("https://aistudio.google.com/api-keys");
    expect((sheet().querySelector("a.guide") as HTMLAnchorElement).href).toBe("https://ai.google.dev/gemini-api/docs/api-key");
    click("Paste my Direct API key");
    expect(state()).toBe("direct-google-paste");
    expect(sheet().querySelector("label")?.textContent).toBe("Direct API key · Gemini");
  });

  it("Anthropic entry names Claude subscriptions and its guide links the Anthropic website", () => {
    const { handle } = mount();
    handle.open();
    click("Direct");
    click("Anthropic");
    expect(sheet().textContent).toContain("Anthropic API credits are billed separately from Claude subscriptions.");
    click("Get my Direct API key");
    const steps = Array.from(sheet().querySelectorAll("ol li")).map((li) => li.textContent?.trim());
    expect(steps).toEqual(["Open the Anthropic website", "Create an API key.", "Copy it and return here."]);
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
  it("Back clears the detached field and restores its draft on return from entry", () => {
    toPaste();
    const field = input();
    field.value = OPENAI_KEY;
    click("Back");
    expect(field.value).toBe("");
    expect(state()).toBe("direct-openai-entry");
    click("I have my Direct API key");
    expect(input().value).toBe(OPENAI_KEY);
  });
  it("Back from a guide-led paste returns to that guide and preserves the draft", () => {
    const { handle } = mount();
    handle.open(); click("Direct"); click("OpenAI"); click("Get my Direct API key");
    click("Paste my Direct API key");
    const field = input();
    field.value = OPENAI_KEY;
    click("Back");
    expect(state()).toBe("direct-openai-guide");
    expect(field.value).toBe("");
    expect(sheet().textContent).not.toContain(OPENAI_KEY);
    click("Paste my Direct API key");
    expect(input().value).toBe(OPENAI_KEY);
  });
  it("closing on the guide clears its held draft", () => {
    const { handle } = mount();
    handle.open(); click("Direct"); click("OpenAI"); click("Get my Direct API key");
    click("Paste my Direct API key"); input().value = OPENAI_KEY; click("Back");
    handle.close(); handle.open(); click("Direct"); click("OpenAI"); click("I have my Direct API key");
    expect(input().value).toBe("");
  });
  it("changing provider clears the previous provider's draft", () => {
    toPaste(); input().value = OPENAI_KEY; click("Back"); click("Back");
    click("Anthropic"); click("I have my Direct API key"); expect(input().value).toBe("");
    click("Back"); click("Back"); click("OpenAI"); click("I have my Direct API key");
    expect(input().value).toBe("");
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
