// @vitest-environment jsdom
/** Every widget state in the design manifest is reachable through the
 *  real screens (the eight hosted grant-* states live on useoutlet.dev). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectRedirect } from "../../src/pkce.js";
import type { OutletSession } from "../../src/index.js";
import { CSS } from "../../src/ui/styles.js";
import {
  ANTHROPIC_KEY, GOOGLE_KEY, OPENAI_KEY, cleanup, click, deferred, flush, mount, paste, state,
  trigger,
} from "./helpers.js";

vi.mock("../../src/pkce.js", () => ({ connectRedirect: vi.fn(async () => undefined) }));

const SHEET_STATES = [
  "choose", "direct-provider", "direct-only",
  "direct-openai-entry", "direct-openai-guide", "direct-openai-paste", "direct-openai-checking", "direct-openai-connected",
  "direct-anthropic-entry", "direct-anthropic-guide", "direct-anthropic-paste", "direct-anthropic-checking", "direct-anthropic-connected",
  "direct-google-entry", "direct-google-guide", "direct-google-paste", "direct-google-checking", "direct-google-connected",
  "direct-error-empty", "direct-error-format", "direct-error-wrong-provider", "direct-error-admin-refused",
  "direct-error-unsupported", "direct-error-handoff-error",
  "vault-explain", "vault-only", "vault-leaving", "vault-connected", "vault-return-error", "vault-return-checking",
  "vault-anthropic-explain", "vault-anthropic-only", "vault-anthropic-leaving", "vault-anthropic-connected",
  "vault-anthropic-return-checking", "vault-anthropic-return-error",
];
const BUTTON_STATES = ["button-idle", "button-hover", "button-focused", "button-connected-openai", "button-connected-anthropic", "button-connected-google"];

const seen = new Set<string>();
const note = () => {
  const s = state();
  if (s) {
    seen.add(s);
    const root = document.querySelector("[data-outlet-overlay]")!.shadowRoot!;
    expect(root.querySelectorAll("[style]"), `inline style on ${s}`).toHaveLength(0);
  }
  return s;
};

afterEach(() => {
  cleanup();
  vi.mocked(connectRedirect).mockClear();
});

async function directWalk(provider: "OpenAI" | "Anthropic" | "Google", goodKey: string) {
  const d = deferred<void>();
  const m = mount();
  m.onSession.mockReturnValue(d.promise);
  m.handle.open(); note();
  click("Direct"); note();
  click(provider); note();
  click("Get my Direct API key"); note();
  click("Paste my Direct API key"); note();
  paste(goodKey);
  await flush();
  note();
  d.resolve();
  await flush();
  note();
  expect(trigger(m.target).className).toBe("connected-button");
  seen.add("button-connected-" + provider.toLowerCase());
  cleanup();
}

describe("the manifest", () => {
  it("every sheet state renders on the way through the flows", async () => {
    await directWalk("OpenAI", OPENAI_KEY);
    await directWalk("Anthropic", ANTHROPIC_KEY);
    await directWalk("Google", GOOGLE_KEY);

    let m = mount({ mode: "direct", providers: ["openai", "anthropic"] });
    m.handle.open(); note();
    click("OpenAI"); click("I have my Direct API key");
    paste(""); await flush(); note();
    paste("bad"); await flush(); note();
    paste(ANTHROPIC_KEY); await flush(); note();
    click("Try another Direct API key");
    paste("sk-admin-x"); await flush(); note();
    click("Get my Direct API key"); click("Paste my Direct API key");
    paste(GOOGLE_KEY); await flush(); note();
    click("Choose provider"); click("OpenAI"); click("I have my Direct API key");
    m.onSession.mockRejectedValue(new Error("x"));
    paste(OPENAI_KEY); await flush(); note();
    cleanup();

    for (const p of ["openai", "anthropic"] as const) {
      m = mount({ providers: [p] });
      m.handle.open(); click("Vault"); note();
      click("Continue to Outlet"); note();
      cleanup();
      m = mount({ mode: "vault", providers: [p] });
      m.handle.open(); note();
      cleanup();
      const bad = deferred<OutletSession>();
      m = mount({ mode: "vault", providers: [p], session: bad.promise });
      note();
      bad.reject(new Error("no")); await flush(); note();
      cleanup();
      const good = deferred<OutletSession>();
      m = mount({ mode: "vault", providers: [p], session: good.promise });
      good.resolve({ grantId: "g", keys: { [p]: "k" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z" });
      await flush(); note();
      cleanup();
    }

    const missing = SHEET_STATES.filter((s) => !seen.has(s));
    expect(missing).toEqual([]);
    const extra = [...seen].filter((s) => !SHEET_STATES.includes(s) && !BUTTON_STATES.includes(s));
    expect(extra).toEqual([]);
  });

  it("the button states: idle by default, hover and focus by CSS, connected by binding", async () => {
    const m = mount();
    const b = trigger(m.target);
    expect(b.className).toBe("fixed-button");
    seen.add("button-idle");
    // hover and focus-visible are CSS on the trigger: the ring rules must exist
    expect(CSS).toContain(".fixed-button:hover{box-shadow:0 0 0 1px");
    seen.add("button-hover");
    expect(CSS).toContain(":focus-visible{outline:3px solid var(--focus);outline-offset:4px}");
    seen.add("button-focused");
    cleanup();
    await directWalk("OpenAI", OPENAI_KEY);
    await directWalk("Anthropic", ANTHROPIC_KEY);
    await directWalk("Google", GOOGLE_KEY);
    expect(BUTTON_STATES.filter((s) => !seen.has(s))).toEqual([]);
  });
});
