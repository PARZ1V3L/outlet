/** What is written from the registry stays the registry: providers.json
 *  for the provider support page. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { providers } from "../src/index.js";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("the support data written from the registry", () => {
  it("docs/providers.json is the registry, as `npm run build` writes it", () => {
    expect(JSON.parse(read("docs/providers.json"))).toEqual({ providers: JSON.parse(JSON.stringify(providers)) });
  });
});
