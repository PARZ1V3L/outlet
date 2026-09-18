// @vitest-environment jsdom
/** The named Direct screen: one template, every registry provider, every
 *  registry value on screen. */
import { afterEach, describe, expect, it } from "vitest";
import { providers } from "../../src/index.js";
import { sampleKey } from "../sample-key.js";
import { cleanup, click, flush, heading, input, mount, paste, sheet, state, trigger } from "./helpers.js";

afterEach(cleanup);

const header = () => sheet().querySelector(".brand")?.textContent;
const steps = () => Array.from(sheet().querySelectorAll("ol.overview-steps li")).map((li) => li.textContent?.trim());

/** What a provider's screen says in place of the template's line. */
const NOTES: Record<string, string> = {
  openai: "OpenAI API credits are billed separately from ChatGPT.",
  anthropic: "Anthropic API credits are billed separately from Claude subscriptions.",
  higgsfield: "Use your Higgsfield key ID and secret together as your Direct API key.",
  huggingface: "Hugging Face calls your Direct API key an access token.",
  fal: "Use an API-scope fal key as your Direct API key.",
  replicate: "Replicate calls your Direct API key an API token.",
};
const OPEN: Record<string, string> = {
  google: "Open Google AI Studio",
  fal: "Open fal’s keys page",
  replicate: "Open Replicate’s API tokens page",
};
const COPY: Record<string, string> = { google: "Copy your Direct API key and return here." };
const FULL_GUIDE: Record<string, string> = {
  openai: "https://useoutlet.dev/docs/users/openai-api-key.html",
  anthropic: "https://useoutlet.dev/docs/users/anthropic-api-key.html",
  google: "https://ai.google.dev/gemini-api/docs/api-key",
};

describe("the named Direct screen", () => {
  it.each(providers.map((p) => [p.id, p] as const))("%s: renders every registry value and connects", async (id, p) => {
    const name = p.displayName;
    const m = mount({ mode: "direct", providers: [id] });
    m.handle.open();

    expect(state()).toBe(`direct-${id}-entry`);
    expect(header()).toBe(`Direct · ${name}`);
    expect(heading()).toBe("Your Direct API key");
    expect(Array.from(sheet().querySelectorAll(".sheet-body p")).map((el) => el.textContent))
      .toEqual([NOTES[id] ?? `Use your ${name} Direct API key in this app.`]);

    click("Get my Direct API key");
    expect(state()).toBe(`direct-${id}-guide`);
    expect(header()).toBe(`Direct · ${name}`);
    expect(heading()).toBe("Get your Direct API key");
    expect(steps()).toEqual([
      OPEN[id] ?? `Open the ${name} website`,
      p.createAction,
      COPY[id] ?? "Copy it and return here.",
    ]);
    const link = sheet().querySelector("ol a.guide-open") as HTMLAnchorElement;
    expect(link.href).toBe(new URL(p.keysUrl).href);
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    // the app did not choose this destination, so no hostname rides beside it
    expect(sheet().querySelector(".link-host")).toBeNull();
    const full = sheet().querySelector("a.guide") as HTMLAnchorElement | null;
    if (FULL_GUIDE[id]) {
      expect(full?.textContent?.trim()).toBe("Full Direct guide");
      expect(full?.href).toBe(FULL_GUIDE[id]);
    } else {
      expect(full).toBeNull();
    }

    click("Paste my Direct API key");
    expect(state()).toBe(`direct-${id}-paste`);
    expect(heading()).toBe("Paste your Direct API key");
    expect(sheet().querySelector("label")?.textContent).toBe(`Direct API key · ${name}`);
    const hint = sheet().querySelector("#outlet-hint") as HTMLElement;
    expect(hint.textContent).toBe(p.formatHint);
    expect(input().getAttribute("aria-describedby")).toBe("outlet-hint");
    expect(input().placeholder).toBe("Paste your Direct API key");
    expect(Array.from(sheet().querySelectorAll(".key-reassurance li")).map((li) => li.textContent))
      .toEqual(["Checked on this device.", "Passed to this app.", "Never sent to Outlet."]);

    const key = sampleKey(p);
    paste(key);
    await flush();
    expect(m.onSession).toHaveBeenCalledTimes(1);
    expect(m.onSession.mock.calls[0]![0].keys).toEqual({ [id]: key });
    expect(state()).toBe(`direct-${id}-connected`);
    expect(heading()).toBe(`Connected to ${name}`);
    expect(trigger(m.target).textContent?.trim()).toBe(`Connected · ${name}`);
    expect(trigger(m.target).getAttribute("aria-label")).toBe(`Connected to ${name} in Direct`);
  });

  it("fal's guide says which scope is for which key", () => {
    const m = mount({ mode: "direct", providers: ["fal"] });
    m.handle.open();
    click("Get my Direct API key");
    expect(sheet().querySelector("p.guide-note")?.textContent).toBe("ADMIN scope is for your Vault admin key.");
    expect(steps()[1]).toBe("Click Add key. Select API scope for your Direct API key, then click Create Key.");
  });

  it("no other guide carries a scope line", () => {
    for (const p of providers.filter((x) => x.id !== "fal")) {
      const m = mount({ mode: "direct", providers: [p.id] });
      m.handle.open();
      click("Get my Direct API key");
      expect(sheet().querySelector("p.guide-note")).toBeNull();
      cleanup();
    }
  });

  it("the list shows all nineteen by display name, in the app's order", () => {
    const ids = providers.map((p) => p.id).reverse();
    const m = mount({ mode: "direct", providers: ids });
    m.handle.open();
    expect(state()).toBe("direct-only");
    expect(Array.from(sheet().querySelectorAll("button.provider"), (b) => b.firstChild?.textContent))
      .toEqual(providers.map((p) => p.displayName).reverse());
  });

  it("a named provider shows the checking state during the hand-off", async () => {
    let release!: () => void;
    const m = mount({ mode: "direct", providers: ["groq"] });
    m.onSession.mockReturnValue(new Promise<void>((r) => { release = r; }));
    m.handle.open();
    click("I have my Direct API key");
    paste("gsk_abc123def456ghi789");
    await flush();
    expect(state()).toBe("direct-groq-checking");
    expect(heading()).toBe("Checking the format");
    release();
    await flush();
    expect(state()).toBe("direct-groq-connected");
  });

  it("a pasted key of another provider names it by its display name", async () => {
    const m = mount({ mode: "direct", providers: ["xai", "google"] });
    m.handle.open();
    click("Grok");
    click("I have my Direct API key");
    paste("AIzaSyExample1234567890");
    await flush();
    expect(state()).toBe("direct-error-wrong-provider");
    expect(heading()).toBe("This looks like Gemini");
    expect(sheet().querySelector("p.error")?.textContent).toBe("You chose Grok for Direct.");
    click("Use Gemini in Direct");
    expect(state()).toBe("direct-google-paste");
  });

  it("an admin key is refused on a named screen as everywhere", async () => {
    const m = mount({ mode: "direct", providers: ["fal"] });
    m.handle.open();
    click("I have my Direct API key");
    paste("sk-admin-abc123");
    await flush();
    expect(state()).toBe("direct-error-admin-refused");
    expect(heading()).toBe("Vault admin keys don’t work in Direct");
    expect(m.onSession).not.toHaveBeenCalled();
    click("Get my Direct API key");
    expect(state()).toBe("direct-fal-guide");
  });
});
