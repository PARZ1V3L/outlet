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

  it("the README's Vault provider line names the registry's Vault providers", () => {
    const ids = providerIds("vault");
    const list = `${ids.slice(0, -1).join(", ")} or ${ids[ids.length - 1]}`;
    expect(read("sdk/README.md")).toContain(`Vault provider: choose ${list}.`);
  });
});
