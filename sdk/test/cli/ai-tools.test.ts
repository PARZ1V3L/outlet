/** The plugin, the skill and the Cursor rule under ai-tools/ carry the
 *  README's prompt and the passed words, never their own. */
import { describe, expect, it } from "vitest";
import { SETUP_PROMPT } from "../../src/cli/prompt.js";
import { read } from "./files.js";

const W12 = "Add the Connect your AI button from Outlet to a web app. Direct: the user pastes their own API key. Vault: the user connects an account with an admin key. Use when asked to add Outlet or to let users use their own OpenAI, Anthropic, fal or OpenRouter account.";
const FIRST = "Read https://useoutlet.dev/llms-full.txt first. If the outlet_docs MCP tool is available, call it instead.";
const LAST = "Ask for the app ID and the return address if Vault is wanted and they were not given.";
const COMMANDS = [
  "claude plugin marketplace add PARZ1V3L/outlet",
  "claude plugin install outlet@useoutlet",
  "claude mcp add outlet -- npx -y @useoutlet/sdk mcp",
  '"outlet": { "command": "npx", "args": ["-y", "@useoutlet/sdk", "mcp"] }',
  "cp ai-tools/cursor/outlet.mdc .cursor/rules/outlet.mdc",
];

/** Frontmatter fields (quotes stripped) and the body after the blank line. */
function frontmatter(markdown: string): { fields: Record<string, string>; body: string } {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  if (!m) throw new Error("no frontmatter");
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const [key, ...rest] = line.split(": ");
    fields[key!] = rest.join(": ").replace(/^"(.*)"$/, "$1");
  }
  return { fields, body: m[2]! };
}

describe("ai-tools/", () => {
  const skill = frontmatter(read("ai-tools/claude-code/skills/add-outlet/SKILL.md"));
  const rule = frontmatter(read("ai-tools/cursor/outlet.mdc"));
  const plugin = JSON.parse(read("ai-tools/claude-code/.claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const version = JSON.parse(read("sdk/package.json")).version;

  it("the skill and the rule carry the prompt block between the two passed lines, and nothing else", () => {
    for (const { body } of [skill, rule]) {
      expect(body).toBe(`${FIRST}\n\n\`\`\`text\n${SETUP_PROMPT}\`\`\`\n\n${LAST}\n`);
    }
  });

  it("one description everywhere: the skill, the rule, the plugin and the marketplace entry", () => {
    expect(skill.fields).toEqual({ name: "add-outlet", description: W12 });
    expect(rule.fields).toEqual({ description: W12, alwaysApply: "false" });
    expect(plugin.description).toBe(W12);
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].description).toBe(W12);
    expect(W12).not.toContain("—");
  });

  it("the plugin is the sdk's version, and the marketplace entry names it and points at it", () => {
    expect(plugin.name).toBe("outlet");
    expect(plugin.version).toBe(version);
    expect(marketplace.name).toBe("useoutlet");
    expect(marketplace.owner).toEqual({ name: "Outlet", email: "hello@useoutlet.dev" });
    expect(marketplace.plugins[0]).toMatchObject({ name: "outlet", source: "./ai-tools/claude-code" });
  });

  it("ai-tools/README.md gives the install commands", () => {
    const tools = read("ai-tools/README.md");
    expect(tools.startsWith("Three ways to hand your AI tool Outlet's docs.\n")).toBe(true);
    for (const command of COMMANDS) expect(tools).toContain(command);
  });
});
