/** One source: the README's paste prompt is SETUP_PROMPT, byte for byte. */
import { expect, it } from "vitest";
import { SETUP_PROMPT } from "../../src/cli/prompt.js";
import { promptBlock, read } from "./files.js";

it("the README's prompt block equals SETUP_PROMPT byte for byte", () => {
  expect(promptBlock(read("sdk/README.md"), "## Building with an AI? Paste this into your AI.")).toBe(SETUP_PROMPT);
});

it("SETUP_PROMPT is the passed lines: one per line, no em dash, ends with a newline", () => {
  expect(SETUP_PROMPT.endsWith("\n")).toBe(true);
  expect(SETUP_PROMPT).not.toContain("—");
  expect(SETUP_PROMPT.split("\n").filter(Boolean).length).toBe(15);
  expect(SETUP_PROMPT).toContain('React or Vue: use useConnectButton from "@useoutlet/sdk/react" or "@useoutlet/sdk/vue".\n');
});
