/** What is written from the registry stays the registry: providers.json
 *  for the provider support page, and the README's Vault provider line. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { providerIds, providers } from "../src/index.js";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("the support data written from the registry", () => {
  it("docs/providers.json is the registry, as `npm run build` writes it", () => {
    expect(JSON.parse(read("docs/providers.json"))).toEqual({ providers: JSON.parse(JSON.stringify(providers)) });
  });

  it("the Python package carries the same rows, byte for byte", () => {
    expect(read("sdk-python/src/useoutlet/providers.json")).toBe(read("docs/providers.json"));
  });

  it("the README's Vault provider line names the registry's Vault providers, in the passed order", () => {
    const list = read("sdk/README.md").match(/^Vault provider: choose (.+?)\. Use a separate/m)?.[1] ?? "";
    expect(list).toBe("openai, anthropic, fal or openrouter");
    expect(list.split(/, | or /).sort()).toEqual([...providerIds("vault")].sort());
  });
});
