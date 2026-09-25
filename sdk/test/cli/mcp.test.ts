/** The outlet command and its MCP docs server as npm ships them: built to
 *  dist/ first, then spawned the way an AI tool spawns them. */
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { SETUP_PROMPT } from "../../src/cli/prompt.js";

const sdk = fileURLToPath(new URL("../../", import.meta.url));
const bin = join(sdk, "dist/cli/index.js");
const fixture = fileURLToPath(new URL("./docs-fixture.txt", import.meta.url));
const pkg = JSON.parse(readFileSync(join(sdk, "package.json"), "utf8")) as { version: string; bin: Record<string, string> };

beforeAll(() => {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  execFileSync(process.execPath, [tsc], { cwd: sdk, stdio: "inherit" });
}, 90_000);

type Reply = { id: unknown; result?: any; error?: { code: number; message: string } };

/** A client of one spawned server: requests by id, the reply as a promise. */
class Client {
  private next = 1;
  private waiting = new Map<unknown, (reply: Reply) => void>();
  readonly stderr: string[] = [];
  constructor(private child: ChildProcess) {
    createInterface({ input: child.stdout! }).on("line", (line) => {
      const reply = JSON.parse(line) as Reply;
      this.waiting.get(reply.id)?.(reply);
      this.waiting.delete(reply.id);
    });
    child.stderr!.on("data", (d: Buffer) => this.stderr.push(String(d)));
  }
  reply(id: unknown): Promise<Reply> {
    return new Promise((resolve) => this.waiting.set(id, resolve));
  }
  request(method: string, params?: unknown): Promise<Reply> {
    const id = this.next++;
    const p = this.reply(id);
    this.raw(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return p;
  }
  raw(line: string): void {
    this.child.stdin!.write(line + "\n");
  }
  close(): Promise<number | null> {
    return new Promise((resolve) => {
      this.child.on("exit", resolve);
      this.child.stdin!.end();
    });
  }
}

const start = (env: Record<string, string> = {}): Client =>
  new Client(spawn(process.execPath, [bin, "mcp"], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] }));

describe("npx @useoutlet/sdk mcp", () => {
  it("initialize, tools/list, both tools, an unknown method, ping, then a clean exit", async () => {
    const c = start({ OUTLET_DOCS_URL: pathToFileURL(fixture).href });
    const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.result).toEqual({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "outlet", version: pkg.version } });
    c.raw(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    const list = await c.request("tools/list");
    expect(list.result.tools).toEqual([
      { name: "outlet_docs", description: "The current Outlet docs in one file.", inputSchema: { type: "object", properties: {} } },
      { name: "outlet_setup_prompt", description: "The setup prompt: how to add the Connect your AI button.", inputSchema: { type: "object", properties: {} } },
    ]);
    const prompt = await c.request("tools/call", { name: "outlet_setup_prompt", arguments: {} });
    expect(prompt.result).toEqual({ content: [{ type: "text", text: SETUP_PROMPT }] });
    const docs = await c.request("tools/call", { name: "outlet_docs", arguments: {} });
    expect(docs.result).toEqual({ content: [{ type: "text", text: readFileSync(fixture, "utf8") }] });
    const unknown = await c.request("resources/list");
    expect(unknown.error).toEqual({ code: -32601, message: "Method not found: resources/list" });
    expect((await c.request("ping")).result).toEqual({});
    expect(await c.close()).toBe(0);
    expect(c.stderr.join("")).toBe("");
  });

  it("an unknown protocol version gets the newest the server speaks", async () => {
    const c = start();
    const init = await c.request("initialize", { protocolVersion: "1900-01-01", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.result.protocolVersion).toBe("2025-11-25");
    expect((await c.request("initialize", { protocolVersion: "2024-11-05" })).result.protocolVersion).toBe("2024-11-05");
    await c.close();
  });

  it("a docs fetch that fails is an isError result naming the URL, logged to stderr", async () => {
    const url = pathToFileURL(join(sdk, "test/cli/no-such-docs.txt")).href;
    const c = start({ OUTLET_DOCS_URL: url });
    const docs = await c.request("tools/call", { name: "outlet_docs", arguments: {} });
    expect(docs.result).toEqual({ content: [{ type: "text", text: `The Outlet docs could not be fetched from ${url}.` }], isError: true });
    await c.close();
    expect(c.stderr.join("")).toContain(`the docs could not be fetched from ${url}`);
  });

  it("an unknown tool, a bad line and a request with no method are JSON-RPC errors", async () => {
    const c = start();
    expect((await c.request("tools/call", { name: "outlet_secrets" })).error).toEqual({ code: -32602, message: "Unknown tool: outlet_secrets" });
    const parse = c.reply(null);
    c.raw("{ not json");
    expect((await parse).error?.code).toBe(-32700);
    const invalid = c.reply(7);
    c.raw(JSON.stringify({ jsonrpc: "2.0", id: 7 }));
    expect((await invalid).error?.code).toBe(-32600);
    await c.close();
  });

  it("no argument prints the help and exits 0; an unknown argument prints it to stderr and exits 1", () => {
    const help = spawnSync(process.execPath, [bin], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: npx @useoutlet/sdk mcp");
    expect(help.stdout).toContain("https://useoutlet.dev/docs/");
    const bad = spawnSync(process.execPath, [bin, "serve"], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toBe(help.stdout);
  });
});

describe("npm pack", () => {
  it("lists dist/cli/index.js, and the packed bin resolves and runs", () => {
    const dest = mkdtempSync(join(tmpdir(), "outlet-pack-"));
    try {
      const out = execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", dest], { cwd: sdk, encoding: "utf8" });
      const [info] = JSON.parse(out) as { filename: string; files: { path: string }[] }[];
      const paths = info!.files.map((f) => f.path);
      expect(paths).toContain("dist/cli/index.js");
      expect(paths).toContain("dist/cli/mcp.js");
      expect(paths).toContain("dist/cli/prompt.js");
      execFileSync("tar", ["-xzf", join(dest, info!.filename), "-C", dest]);
      const packed = JSON.parse(readFileSync(join(dest, "package/package.json"), "utf8")) as { bin: Record<string, string> };
      expect(packed.bin).toEqual({ outlet: "./dist/cli/index.js" });
      expect(pkg.bin).toEqual(packed.bin);
      const help = spawnSync(process.execPath, [join(dest, "package", packed.bin.outlet!)], { encoding: "utf8" });
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("Usage: npx @useoutlet/sdk mcp");
      expect(readFileSync(join(dest, "package/dist/cli/index.js"), "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  }, 60_000);
});
