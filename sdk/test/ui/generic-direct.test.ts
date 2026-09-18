// @vitest-environment jsdom
/** The generic Direct screen: a provider outside the registry, shown with
 *  the name and keys page the app supplies, or with no keys page at all. */
import { afterEach, describe, expect, it } from "vitest";
import { OutletError } from "../../src/index.js";
import { mountConnectButton } from "../../src/ui/index.js";
import { cleanup, click, deferred, flush, heading, input, mount, paste, sheet, state, trigger } from "./helpers.js";

afterEach(cleanup);

const RUNWAY = { id: "runway", name: "Runway", keysUrl: "https://dev.runwayml.com/" };
const NO_PAGE = { id: "luma", name: "Luma" };
const header = () => sheet().querySelector(".brand")?.textContent;
const lines = () => Array.from(sheet().querySelectorAll(".sheet-body p:not([hidden])")).map((p) => p.textContent);
const names = () => Array.from(sheet().querySelectorAll<HTMLElement>(".actions button, .actions a"), (b) => b.textContent?.trim());

describe("with a keys page", () => {
  it("entry, guide and paste carry the app's name and link to the app's keys page", () => {
    const m = mount({ mode: "direct", providers: [RUNWAY] });
    m.handle.open();
    expect(state()).toBe("direct-runway-entry");
    expect(header()).toBe("Direct · Runway");
    expect(heading()).toBe("Your Direct API key");
    expect(lines()).toEqual(["Use your Runway Direct API key in this app."]);
    expect(names()).toEqual(["Get my Direct API key", "I have my Direct API key"]);

    click("Get my Direct API key");
    expect(state()).toBe("direct-runway-guide");
    expect(heading()).toBe("Get your Direct API key");
    const items = Array.from(sheet().querySelectorAll("ol.overview-steps li"));
    expect(items[0]!.querySelector(".link-label")?.textContent).toBe("Open Runway to get your Direct API key");
    expect(items.slice(1).map((li) => li.textContent)).toEqual([
      "Follow Runway’s steps to create your Direct API key.",
      "Copy your Direct API key and return here.",
    ]);
    const link = items[0]!.querySelector("a") as HTMLAnchorElement;
    expect(link.href).toBe("https://dev.runwayml.com/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    // the app chose the destination, so its hostname shows beside the link
    expect(items[0]!.querySelector(".link-host")?.textContent).toBe("dev.runwayml.com");
    // no guide page of Outlet's exists for it, so no full guide link
    expect(sheet().querySelector("a.guide")).toBeNull();

    click("Paste my Direct API key");
    expect(state()).toBe("direct-runway-paste");
    expect(sheet().querySelector("label")?.textContent).toBe("Direct API key · Runway");
    expect(sheet().querySelector("#outlet-hint")).toBeNull();
    expect(input().getAttribute("aria-describedby")).toBeNull();
    expect(Array.from(sheet().querySelectorAll(".key-reassurance li"), (li) => li.textContent))
      .toEqual(["Your Direct API key is passed to this app. It is never sent to Outlet."]);
    expect(sheet().textContent).not.toContain("Checked on this device.");
  });

  it("connects without a checking state: no format check of the provider's own ran", async () => {
    const d = deferred<void>();
    const m = mount({ mode: "direct", providers: [RUNWAY] });
    m.onSession.mockReturnValue(d.promise);
    m.handle.open();
    click("I have my Direct API key");
    const field = input();
    paste("key_live_abc123def456");
    await flush();
    expect(state()).toBe("direct-runway-paste");
    expect(sheet().textContent).not.toContain("Checking the format");
    expect(field.value).toBe("");
    expect(field.disabled).toBe(true);
    expect((sheet().querySelector("button.save") as HTMLButtonElement).disabled).toBe(true);
    expect(sheet().getAttribute("aria-busy")).toBe("true");
    d.resolve();
    await flush();
    expect(m.onSession.mock.calls[0]![0].keys).toEqual({ runway: "key_live_abc123def456" });
    expect(state()).toBe("direct-runway-connected");
    expect(heading()).toBe("Connected to Runway");
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · Runway");
    expect(trigger(m.target).getAttribute("aria-label")).toBe("Connected to Runway in Direct");
  });

  it("an app that throws gets the try-again screen, and the field comes back", async () => {
    const m = mount({ mode: "direct", providers: [RUNWAY] });
    m.onSession.mockRejectedValue(new Error("x"));
    m.handle.open();
    click("I have my Direct API key");
    paste("key_live_abc123def456");
    await flush();
    expect(state()).toBe("direct-error-handoff-error");
    expect(sheet().querySelector(".brand")?.textContent).toBe("Direct · Runway");
    click("Try again");
    expect(state()).toBe("direct-runway-paste");
    expect(input().disabled).toBe(false);
  });

  it("sits in the list beside named providers, and the empty field error names it", async () => {
    const m = mount({ mode: "direct", providers: ["openai", RUNWAY] });
    m.handle.open();
    expect(Array.from(sheet().querySelectorAll("button.provider"), (b) => b.firstChild?.textContent)).toEqual(["OpenAI", "Runway"]);
    click("Runway");
    click("I have my Direct API key");
    paste("   ");
    await flush();
    expect(state()).toBe("direct-error-empty");
    expect(input().getAttribute("aria-describedby")).toBeNull();
  });

  it("a held session for a described provider binds its name", () => {
    const m = mount({
      mode: "direct", providers: [RUNWAY],
      session: { grantId: "direct_x", keys: { runway: "k" }, capUsd: Infinity, expiresAt: "9999-12-31T23:59:59Z", mode: "direct" },
    });
    expect(trigger(m.target).textContent?.trim()).toBe("Connected · Runway");
    m.handle.open();
    expect(state()).toBe("direct-runway-connected");
  });
});

describe("with no keys page", () => {
  it("says so, offers no link and no guide, and still takes a key the person has", async () => {
    const m = mount({ mode: "direct", providers: [NO_PAGE] });
    m.handle.open();
    expect(state()).toBe("direct-luma-entry");
    expect(header()).toBe("Direct · Luma");
    expect(lines()).toEqual([
      "Use your Luma Direct API key in this app.",
      "This app has not provided a page for getting your Luma Direct API key.",
    ]);
    expect(names()).toEqual(["I have my Direct API key"]);
    expect(sheet().querySelectorAll("a")).toHaveLength(0);
    click("I have my Direct API key");
    expect(state()).toBe("direct-luma-paste");
    expect(sheet().querySelectorAll("a")).toHaveLength(0);
    paste("luma-abc123def456");
    await flush();
    expect(state()).toBe("direct-luma-connected");
    expect(m.onSession.mock.calls[0]![0].keys).toEqual({ luma: "luma-abc123def456" });
  });

  it("the admin-key refusal leads back to the entry, never to a guide with no link", async () => {
    const m = mount({ mode: "direct", providers: [NO_PAGE] });
    m.handle.open();
    click("I have my Direct API key");
    paste("sk-admin-abc123");
    await flush();
    expect(state()).toBe("direct-error-admin-refused");
    click("Get my Direct API key");
    expect(state()).toBe("direct-luma-entry");
    expect(sheet().textContent).toContain("This app has not provided a page");
  });
});

describe("what the app may describe", () => {
  const base = { mode: "direct" as const, onSession() {} };
  const err = (providers: unknown[]) => {
    try {
      mountConnectButton(document.createElement("div"), { ...base, providers: providers as never });
    } catch (e) {
      expect(e).toBeInstanceOf(OutletError);
      return (e as OutletError).code;
    }
    throw new Error("expected a throw");
  };
  it("a name is required", () => {
    expect(err([{ id: "runway" }])).toBe("ui_provider_name_required");
    expect(err([{ id: "runway", name: "  " }])).toBe("ui_provider_name_required");
  });
  it("the keys page must be an https address", () => {
    expect(err([{ ...RUNWAY, keysUrl: "javascript:alert(1)" }])).toBe("ui_provider_keys_url");
    expect(err([{ ...RUNWAY, keysUrl: "http://dev.runwayml.com/" }])).toBe("ui_provider_keys_url");
    expect(err([{ ...RUNWAY, keysUrl: "not an address" }])).toBe("ui_provider_keys_url");
  });
  it("the id must be one a session can file a key under", () => {
    expect(err([{ id: "", name: "X" }])).toBe("ui_provider_id");
    expect(err([{ id: "two words", name: "X" }])).toBe("ui_provider_id");
    expect(err([{ name: "X" }])).toBe("ui_provider_id");
  });
  it("a registry id keeps its named Direct screen, whatever the app calls it", () => {
    const m = mount({ mode: "direct", providers: [{ id: "groq", name: "My Groq", keysUrl: "https://example.com/" }] });
    m.handle.open();
    expect(header()).toBe("Direct · Groq");
    click("Get my Direct API key");
    expect((sheet().querySelector("ol a") as HTMLAnchorElement).href).toBe("https://console.groq.com/keys");
  });
  it("a described provider is never offered in Vault", () => {
    try {
      mountConnectButton(document.createElement("div"), {
        mode: "vault", providers: [RUNWAY], appId: "app_x", redirectUri: "https://a/b", onSession() {},
      });
      throw new Error("expected a throw");
    } catch (e) {
      expect((e as OutletError).code).toBe("ui_no_vault_provider");
    }
  });
});
