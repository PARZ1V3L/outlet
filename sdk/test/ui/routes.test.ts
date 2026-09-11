/** The route contract as pure functions: opening screens, Back, connected. */
import { describe, expect, it } from "vitest";
import {
  type Config, connectedView, directStart, directView, openingView, parentView,
  providerListView, vaultView,
} from "../../src/ui/routes.js";

const both: Config = { mode: "both", direct: ["openai", "anthropic", "google"], vault: "openai" };
const directOnly: Config = { mode: "direct", direct: ["openai", "anthropic"], vault: null };
const oneDirect: Config = { mode: "direct", direct: ["anthropic"], vault: null };
const bothOne: Config = { mode: "both", direct: ["google"], vault: "google" as never };
const vaultOpenai: Config = { mode: "vault", direct: [], vault: "openai" };
const vaultAnthropic: Config = { mode: "vault", direct: [], vault: "anthropic" };
const bothAnthropic: Config = { mode: "both", direct: ["anthropic"], vault: "anthropic" };

describe("opening screens", () => {
  it("both opens choose", () => expect(openingView(both).id).toBe("choose"));
  it("direct opens direct-only", () => expect(openingView(directOnly).id).toBe("direct-only"));
  it("one Direct provider skips the list", () => {
    expect(openingView(oneDirect)).toEqual({ id: "direct-anthropic-entry", provider: "anthropic" });
    expect(directStart(bothOne)).toEqual({ id: "direct-google-entry", provider: "google" });
  });
  it("vault opens vault-only for OpenAI, vault-anthropic-only for Anthropic", () => {
    expect(openingView(vaultOpenai).id).toBe("vault-only");
    expect(openingView(vaultAnthropic).id).toBe("vault-anthropic-only");
  });
  it("Direct from choose goes to the provider list", () => {
    expect(directStart(both).id).toBe("direct-provider");
    expect(providerListView(directOnly)?.id).toBe("direct-only");
    expect(providerListView(oneDirect)).toBeNull();
  });
  it("Vault from choose explains the one named provider", () => {
    expect(vaultView(both, "explain").id).toBe("vault-explain");
    expect(vaultView(bothAnthropic, "explain").id).toBe("vault-anthropic-explain");
  });
});

describe("Back", () => {
  it("is absent on the first screen of a single mode and on the transient or final screens", () => {
    for (const cfg of [directOnly, vaultOpenai, vaultAnthropic]) {
      expect(parentView(cfg, openingView(cfg))).toBeNull();
    }
    expect(parentView(both, { id: "choose" })).toBeNull();
    expect(parentView(both, directView("checking", "openai"))).toBeNull();
    expect(parentView(both, directView("connected", "openai"))).toBeNull();
    expect(parentView(both, vaultView(both, "return-checking"))).toBeNull();
    expect(parentView(both, vaultView(both, "connected"))).toBeNull();
    expect(parentView(oneDirect, directView("entry", "anthropic"))).toBeNull();
  });
  it("walks the Direct chain: paste → entry → list → choose", () => {
    expect(parentView(both, directView("paste", "openai"))).toEqual(directView("entry", "openai"));
    expect(parentView(both, directView("guide", "openai"))).toEqual(directView("entry", "openai"));
    expect(parentView(both, directView("entry", "openai"))?.id).toBe("direct-provider");
    expect(parentView(both, { id: "direct-provider" })?.id).toBe("choose");
    expect(parentView(bothOne, directView("entry", "google"))?.id).toBe("choose");
  });
  it("the field errors go where paste goes; the other errors go to paste", () => {
    expect(parentView(both, { id: "direct-error-empty", provider: "openai" })).toEqual(directView("entry", "openai"));
    expect(parentView(both, { id: "direct-error-format", provider: "openai" })).toEqual(directView("entry", "openai"));
    for (const id of ["direct-error-wrong-provider", "direct-error-admin-refused", "direct-error-unsupported", "direct-error-handoff-error"] as const) {
      expect(parentView(both, { id, provider: "openai" })).toEqual(directView("paste", "openai"));
    }
  });
  it("walks the Vault chain: leaving and return-error → explain → choose", () => {
    expect(parentView(both, vaultView(both, "leaving")).id).toBe("vault-explain");
    expect(parentView(both, vaultView(both, "return-error")).id).toBe("vault-explain");
    expect(parentView(both, { id: "vault-explain" })?.id).toBe("choose");
    expect(parentView(vaultAnthropic, vaultView(vaultAnthropic, "leaving")).id).toBe("vault-anthropic-only");
    expect(parentView(bothAnthropic, { id: "vault-anthropic-explain" })?.id).toBe("choose");
  });
});

describe("connected screens bind the completed mode", () => {
  it("Direct connected per provider, Vault connected per named provider", () => {
    expect(connectedView(both, "direct", "google").id).toBe("direct-google-connected");
    expect(connectedView(both, "vault", "openai").id).toBe("vault-connected");
    expect(connectedView(bothAnthropic, "vault", "anthropic").id).toBe("vault-anthropic-connected");
    // the bound provider wins over the one the config would request
    expect(connectedView(both, "vault", "anthropic").id).toBe("vault-anthropic-connected");
  });
});
