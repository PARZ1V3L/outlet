/** The provider registry, and direct() against every entry in it. */
import { describe, expect, it } from "vitest";
import { OutletError, direct, getProvider, providerIds, providers } from "../src/index.js";
import { sampleKey } from "./sample-key.js";

const IDS = [
  "openai", "anthropic", "google", "deepseek", "xai", "moonshot", "mistral", "zai", "minimax",
  "perplexity", "openrouter", "groq", "cerebras", "together", "fireworks", "higgsfield",
  "huggingface", "fal", "replicate",
];
const NAMES = [
  "OpenAI", "Anthropic", "Gemini", "DeepSeek", "Grok", "Kimi", "Mistral", "Z.ai", "MiniMax",
  "Perplexity", "OpenRouter", "Groq", "Cerebras", "Together AI", "Fireworks AI", "Higgsfield",
  "Hugging Face", "fal", "Replicate",
];
const STRICT = ["openai", "anthropic", "google"];

async function errorOf(p: Promise<unknown>): Promise<OutletError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OutletError);
    return e as OutletError;
  }
  throw new Error("expected rejection, got success");
}

describe("the provider registry", () => {
  it("holds the nineteen, ids as company names, display names as the wall shows them", () => {
    expect(providers.map((p) => p.id)).toEqual(IDS);
    expect(providers.map((p) => p.displayName)).toEqual(NAMES);
    expect(new Set(IDS).size).toBe(19);
  });

  it("marks ten makers, then nine hosts", () => {
    expect(providers.slice(0, 10).every((p) => p.kind === "maker")).toBe(true);
    expect(providers.slice(10).every((p) => p.kind === "host")).toBe(true);
  });

  it("offers Direct and a named screen everywhere, Vault for OpenAI, Anthropic, OpenRouter and fal alone", () => {
    expect(providerIds("direct")).toEqual(IDS);
    expect(providerIds("button")).toEqual(IDS);
    expect(providerIds("vault")).toEqual(["openai", "anthropic", "openrouter", "fal"]);
  });

  it("marks every provider OpenAI-compatible except fal, Replicate and Higgsfield", () => {
    expect(providers.filter((p) => !p.openaiCompatible).map((p) => p.id).sort())
      .toEqual(["fal", "higgsfield", "replicate"]);
  });

  it.each(providers.map((p) => [p.id, p] as const))("%s: a keys page, words and a dated docs check", (_id, p) => {
    expect(new URL(p.keysUrl).protocol).toBe("https:");
    for (const words of [p.keyTerm, p.createAction, p.formatHint]) {
      expect(words.trim()).toBe(words);
      expect(words.length).toBeGreaterThan(2);
      expect(words).not.toContain("\u2014");
    }
    const directCheck = p.checks.find((c) => c.mode === "direct");
    expect(directCheck).toBeDefined();
    for (const c of p.checks) {
      expect(["docs", "request"]).toContain(c.how);
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new URL(c.source).protocol).toBe("https:");
      // a Vault check is only ever recorded where Vault is offered
      if (c.mode === "vault") expect(p.modes.vault).toBe(true);
    }
    if (p.keyShape) {
      expect(Boolean(p.keyShape.prefix) !== Boolean(p.keyShape.pattern)).toBe(true);
      if (p.keyShape.pattern) expect(p.keyShape.pattern).toContain(p.keyShape.separator as string);
      expect(new URL(p.keyShape.source).protocol).toBe("https:");
    }
  });

  it("a format hint names a prefix only where the documentation gives one", () => {
    const naming = providers.filter((p) => p.formatHint.includes("starts with"));
    expect(naming.map((p) => p.id)).toEqual([
      "google", "deepseek", "xai", "perplexity", "openrouter", "groq", "cerebras", "fireworks",
      "huggingface", "replicate",
    ]);
    for (const p of naming) {
      expect(p.formatHint).toBe(`Your ${p.displayName} Direct API key starts with ${p.keyShape?.prefix}.`);
    }
  });

  it("a provider with no documented key shape gets the no-prefix hint", () => {
    const shapeless = providers.filter((p) => !p.keyShape);
    expect(shapeless.map((p) => p.id)).toEqual(["moonshot", "mistral", "minimax", "together"]);
    for (const p of shapeless) {
      expect(p.formatHint).toBe(`Paste your whole ${p.displayName} Direct API key.`);
    }
    expect(getProvider("moonshot")?.formatHint).toBe("Paste your whole Kimi Direct API key.");
    expect(getProvider("minimax")?.formatHint).toBe("Paste your whole MiniMax Direct API key.");
  });

  it("getProvider() answers by id and knows nothing else", () => {
    expect(getProvider("xai")?.displayName).toBe("Grok");
    expect(getProvider("runway")).toBeUndefined();
    expect(getProvider("constructor")).toBeUndefined();
  });
});

describe("direct() with every registry provider", () => {
  it.each(providers.map((p) => [p.id, p] as const))("%s: a key of the documented shape passes whole", async (id, p) => {
    const key = sampleKey(p);
    const session = await direct({ keys: { [id]: key } });
    expect(session.keys[id]).toBe(key);
    expect(session.mode).toBe("direct");
  });

  it("the fal Direct key passes whole, with its colon", async () => {
    const key = "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d:9f8e7d6c5b4a39281706f5e4d3c2b1a0";
    const session = await direct({ keys: { fal: `  "${key}"\n` } });
    expect(session.keys.fal).toBe(key);
    expect(session.keys.fal).toContain(":");
  });

  it("two-part keys keep their separator: Z.ai's dot and Higgsfield's colon", async () => {
    const session = await direct({ keys: { zai: "keyid123.secret456", higgsfield: "keyid123:secret456" } });
    expect(session.keys.zai).toBe("keyid123.secret456");
    expect(session.keys.higgsfield).toBe("keyid123:secret456");
  });

  const opaque = providers.filter((p) => !STRICT.includes(p.id));
  it.each(opaque.map((p) => [p.id] as const))("%s: the format hint is copy, a key of another shape still passes", async (id) => {
    const session = await direct({ keys: { [id]: "some-other-shape-0123456789" } });
    expect(session.keys[id]).toBe("some-other-shape-0123456789");
  });

  it("OpenAI, Anthropic and Google keep their strict format check", async () => {
    for (const id of STRICT) {
      expect((await errorOf(direct({ keys: { [id]: "some-other-shape-0123456789" } }))).code).toBe("invalid_key_format");
    }
  });

  it.each(providers.map((p) => [p.id] as const))("%s: every existing refusal holds", async (id) => {
    expect((await errorOf(direct({ keys: { [id]: "   " } }))).code).toBe("invalid_key_format");
    expect((await errorOf(direct({ keys: { [id]: "sk-admin-abc123" } }))).code).toBe("admin_key_rejected");
    expect((await errorOf(direct({ keys: { [id]: "sk-ant-admin01-abc123" } }))).code).toBe("admin_key_rejected");
    if (id !== "anthropic") {
      expect((await errorOf(direct({ keys: { [id]: "sk-ant-api03-abc123" } }))).code).toBe("wrong_provider_key");
    }
    if (id !== "google") {
      expect((await errorOf(direct({ keys: { [id]: "AIzaSyExample123" } }))).code).toBe("wrong_provider_key");
    }
  });

  it("error messages use the registry's display names", async () => {
    expect((await errorOf(direct({ keys: { xai: " " } }))).message).toBe("Empty Grok key.");
    expect((await errorOf(direct({ keys: { someprovider: " " } }))).message).toBe("Empty someprovider key.");
  });
});
