// @vitest-environment jsdom
/** Vault appears only where the registry marks modes.vault, and fal's
 *  Vault screens say fal's words. connectRedirect() is stubbed. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectRedirect } from "../../src/pkce.js";
import { providers } from "../../src/providers.js";
import { type OutletError, type OutletSession } from "../../src/types.js";
import { mountConnectButton } from "../../src/ui/index.js";
import { cleanup, click, deferred, flush, heading, mount, sheet, state, trigger } from "./helpers.js";

vi.mock("../../src/pkce.js", () => ({ connectRedirect: vi.fn() }));
const redirect = vi.mocked(connectRedirect);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const header = () => sheet().querySelector(".brand")?.textContent;
const vaultOptions = { appId: "app_test", redirectUri: "https://app.example/outlet/return", onSession() {} };
const EXPLAIN: Record<string, string> = {
  openai: "vault-only", anthropic: "vault-anthropic-only", openrouter: "vault-openrouter-only", fal: "vault-fal-only",
};

describe("Vault gating by modes.vault", () => {
  it.each(providers.map((p) => [p.id, p] as const))("%s alone in Vault mode", (id, p) => {
    const open = () => mountConnectButton(document.body.appendChild(document.createElement("div")), {
      ...vaultOptions, mode: "vault", providers: [id],
    });
    if (!p.modes.vault) {
      let code = "";
      try { open(); } catch (e) { code = (e as OutletError).code; }
      expect(code).toBe("ui_no_vault_provider");
      return;
    }
    const handle = open();
    handle.open();
    expect(state()).toBe(EXPLAIN[id]);
    expect(header()).toBe(`Vault · ${p.displayName}`);
  });

  it("the refusal names the providers Vault covers, from the registry", () => {
    try {
      mountConnectButton(document.createElement("div"), { ...vaultOptions, mode: "both", providers: ["groq", "replicate"] });
      throw new Error("expected a throw");
    } catch (e) {
      expect((e as OutletError).code).toBe("ui_no_vault_provider");
      expect((e as OutletError).message).toBe(
        "Vault needs one of these in providers: openai, anthropic, openrouter, fal.",
      );
    }
  });

  it("both: Direct lists every provider, Vault names the first one Vault covers", async () => {
    redirect.mockReturnValue(deferred<never>().promise as never);
    const m = mount({ providers: ["groq", "replicate", "fal", "openai"] });
    m.handle.open();
    click("Direct");
    expect(sheet().querySelectorAll("button.provider")).toHaveLength(4);
    click("Back");
    click("Vault");
    expect(state()).toBe("vault-fal-explain");
    click("Continue to Outlet");
    expect(state()).toBe("vault-fal-leaving");
    expect(redirect.mock.calls[0]![0]).toMatchObject({ appId: "app_test", providers: ["fal"] });
  });

  it("a Vault session for a provider Vault does not cover binds nothing", () => {
    const session: OutletSession = { grantId: "grant_1", keys: { groq: "gsk_x" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z", mode: "vault" };
    const m = mount({ providers: ["groq", "openai"], session });
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connect your AI");
  });
});

describe("fal in Vault", () => {
  it("explains with fal's words, the cap line in view without opening the detail", () => {
    const m = mount({ providers: ["fal"] });
    m.handle.open();
    click("Vault");
    expect(state()).toBe("vault-fal-explain");
    expect(header()).toBe("Vault · fal");
    expect(heading()).toBe("Connect your account");
    const body = sheet().querySelector(".sheet-body") as HTMLElement;
    const own = (cls: boolean) => Array.from(body.children).filter((el) => el.tagName === "P" && el.classList.contains("fine") === cls);
    expect(own(false).map((p) => p.textContent)).toEqual([
      "Add your fal Vault admin key on useoutlet.dev.",
      "On fal, create your Vault admin key with ADMIN scope and name it Outlet.",
      "Outlet uses your Vault admin key to create and delete this app’s Vault App key.",
      "Your Vault admin key is never given to apps.",
    ]);
    const details = body.querySelector("details.vault-details") as HTMLDetailsElement;
    expect(details.querySelector("summary")?.textContent).toBe("Vault access and caps");
    expect(Array.from(details.querySelectorAll("li"), (li) => li.textContent)).toEqual([
      "This app gets its own Vault App key in your fal account.",
      "Outlet tracks spending for this Vault App key from fal’s usage reports.",
      "Revoke Vault access any time.",
    ]);
    const cap = "fal does not enforce a spending limit on each Vault App key. Outlet uses delayed fal spending reports to enforce your Vault cap. Spending can exceed the Vault cap.";
    expect(details.textContent).not.toContain(cap);
    expect(own(true).map((p) => p.textContent)).toEqual([cap]);
    expect(own(true)[0]!.classList.contains("fine-in-view")).toBe(true);
    expect(sheet().textContent).not.toContain("API-scope");
    expect(Array.from(sheet().querySelectorAll(".actions button"), (b) => b.textContent)).toEqual(["Continue to Outlet"]);
  });

  it("explains OpenRouter with OpenRouter's words, the cap line in view without opening the detail", () => {
    const m = mount({ providers: ["openrouter"] });
    m.handle.open();
    click("Vault");
    expect(state()).toBe("vault-openrouter-explain");
    expect(header()).toBe("Vault · OpenRouter");
    expect(heading()).toBe("Connect your account");
    const body = sheet().querySelector(".sheet-body") as HTMLElement;
    const own = (cls: boolean) => Array.from(body.children).filter((el) => el.tagName === "P" && el.classList.contains("fine") === cls);
    expect(own(false).map((p) => p.textContent)).toEqual([
      "Add your OpenRouter Vault management key on useoutlet.dev.",
      "On OpenRouter, create a management key named Outlet for Vault.",
      "Outlet uses your Vault management key to create and manage this app’s Vault App key.",
      "Your Vault management key is never given to apps.",
    ]);
    const details = body.querySelector("details.vault-details") as HTMLDetailsElement;
    expect(details.querySelector("summary")?.textContent).toBe("Vault access and caps");
    expect(Array.from(details.querySelectorAll("li"), (li) => li.textContent)).toEqual([
      "This app gets its own Vault App key in your OpenRouter account.",
      "Outlet reads this Vault App key’s monthly spending from OpenRouter.",
      "Revoking Vault access disables this app’s Vault App key, then deletes it.",
    ]);
    const cap = "OpenRouter holds your monthly Vault cap on this app’s Vault App key. At the Vault cap, the Vault App key is paused and kept. Raise the Vault cap to continue.";
    expect(details.textContent).not.toContain(cap);
    expect(own(true).map((p) => p.textContent)).toEqual([cap]);
    expect(own(true)[0]!.classList.contains("fine-in-view")).toBe(true);
    expect(sheet().textContent).not.toContain("admin key");
    expect(Array.from(sheet().querySelectorAll(".actions button"), (b) => b.textContent)).toEqual(["Continue to Outlet"]);
  });

  it("the OpenRouter return page: checking, then Connected to OpenRouter, under OpenRouter's header", async () => {
    const d = deferred<OutletSession>();
    const m = mount({ mode: "vault", providers: ["openrouter"], session: d.promise });
    expect(state()).toBe("vault-openrouter-return-checking");
    expect(header()).toBe("Vault · OpenRouter");
    d.resolve({ grantId: "grant_1", keys: { openrouter: "sk-or-v1-fixture" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z", mode: "vault" });
    await flush();
    expect(state()).toBe("vault-openrouter-connected");
    expect(heading()).toBe("Connected to OpenRouter");
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connected to OpenRouter in Vault");
  });

  it("OpenAI and Anthropic keep their cap line inside the detail", () => {
    for (const p of ["openai", "anthropic"]) {
      const m = mount({ providers: [p] });
      m.handle.open();
      click("Vault");
      expect(sheet().querySelector("p.fine-in-view")).toBeNull();
      expect(sheet().querySelector("details")?.textContent).toContain("Vault caps use provider spend reports.");
      cleanup();
    }
  });

  it("the return page: checking, then Connected to fal, under fal's header", async () => {
    const d = deferred<OutletSession>();
    const m = mount({ mode: "vault", providers: ["fal"], session: d.promise });
    expect(state()).toBe("vault-fal-return-checking");
    expect(header()).toBe("Vault · fal");
    expect(heading()).toBe("Checking your Vault connection");
    d.resolve({ grantId: "grant_1", keys: { fal: "id:secret" }, capUsd: 5, expiresAt: "2026-10-01T00:00:00Z", mode: "vault" });
    await flush();
    expect(state()).toBe("vault-fal-connected");
    expect(heading()).toBe("Connected to fal");
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connected to fal in Vault");
    expect((sheet().querySelector("a.provider-link") as HTMLAnchorElement).href).toBe("https://useoutlet.dev/account/");
  });

  it("a failed start and a failed return keep fal's header and the shared words", async () => {
    redirect.mockRejectedValue(new Error("down"));
    const m = mount({ mode: "vault", providers: ["fal"] });
    m.handle.open();
    click("Continue to Outlet");
    await flush();
    expect(state()).toBe("vault-fal-start-error");
    expect(header()).toBe("Vault · fal");
    expect(heading()).toBe("Couldn’t open Outlet");
    click("Back");
    expect(state()).toBe("vault-fal-only");
    cleanup();
    const bad = deferred<OutletSession>();
    mount({ mode: "vault", providers: ["fal"], session: bad.promise });
    bad.reject(new Error("no"));
    await flush();
    expect(state()).toBe("vault-fal-return-error");
    expect(heading()).toBe("Vault is not connected");
  });
});
