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

type Reply = { raw: string; id: unknown; result?: any; error?: { code: number; message: string; data?: unknown } };

/** A client of one spawned server: requests by id, the reply as a promise. */
class Client {
  private next = 1;
  private waiting = new Map<unknown, (reply: Reply) => void>();
  readonly stderr: string[] = [];
  /** Every line the server wrote to stdout. */
  readonly received: string[] = [];
  constructor(private child: ChildProcess) {
    createInterface({ input: child.stdout! }).on("line", (line) => {
      this.received.push(line);
      const reply = { ...(JSON.parse(line) as Omit<Reply, "raw">), raw: line };
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

const TOOLS = [
  { name: "outlet_docs", description: "The current Outlet docs in one file.", inputSchema: { type: "object", properties: {} } },
  { name: "outlet_setup_prompt", description: "The setup prompt: how to add the Connect your AI button.", inputSchema: { type: "object", properties: {} } },
];
const META = {
  version: "io.modelcontextprotocol/protocolVersion",
  capabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
};
const SERVER_INFO = { [META.serverInfo]: { name: "outlet", version: pkg.version } };
const INSTRUCTIONS = "Outlet adds the Connect your AI button to a web app. Call outlet_docs for the docs and outlet_setup_prompt for the setup steps.";
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" };
/** Params of a 2026-07-28 request: the method's own, plus the _meta every modern request carries. */
const modern = (params: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...params,
  _meta: { [META.version]: "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "test", version: "0" }, [META.capabilities]: {}, ...meta },
});

describe("npx @useoutlet/sdk mcp", () => {
  it("initialize, tools/list, both tools, an unknown method, ping, then a clean exit", async () => {
    const c = start({ OUTLET_DOCS_URL: pathToFileURL(fixture).href });
    const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.result).toEqual({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "outlet", version: pkg.version } });
    c.raw(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    const list = await c.request("tools/list");
    expect(list.result).toEqual({ tools: TOOLS });
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

describe("the 2026-07-28 revision", () => {
  it("server/discover answers the DiscoverResult, byte for byte", async () => {
    const c = start();
    const d = await c.request("server/discover", modern());
    expect(d.raw).toBe(JSON.stringify({ jsonrpc: "2.0", id: d.id, result: {
      resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} }, _meta: SERVER_INFO, instructions: INSTRUCTIONS, ...CACHE,
    } }));
    expect(await c.close()).toBe(0);
    expect(c.stderr.join("")).toBe("");
  });

  it("tools/list and both tools carry resultType and serverInfo, with the same tools and content; ping is gone", async () => {
    const c = start({ OUTLET_DOCS_URL: pathToFileURL(fixture).href });
    expect((await c.request("tools/list", modern())).result).toEqual({ resultType: "complete", tools: TOOLS, _meta: SERVER_INFO, ...CACHE });
    const prompt = await c.request("tools/call", modern({ name: "outlet_setup_prompt", arguments: {} }));
    expect(prompt.result).toEqual({ resultType: "complete", content: [{ type: "text", text: SETUP_PROMPT }], _meta: SERVER_INFO });
    const docs = await c.request("tools/call", modern({ name: "outlet_docs", arguments: {} }));
    expect(docs.result).toEqual({ resultType: "complete", content: [{ type: "text", text: readFileSync(fixture, "utf8") }], _meta: SERVER_INFO });
    expect((await c.request("ping", modern())).error).toEqual({ code: -32601, message: "Method not found: ping" });
    expect(await c.close()).toBe(0);
    expect(c.stderr.join("")).toBe("");
  });

  it("a failed docs fetch is the same isError result, with the modern fields", async () => {
    const url = pathToFileURL(join(sdk, "test/cli/no-such-docs.txt")).href;
    const c = start({ OUTLET_DOCS_URL: url });
    const docs = await c.request("tools/call", modern({ name: "outlet_docs", arguments: {} }));
    expect(docs.result).toEqual({ resultType: "complete", content: [{ type: "text", text: `The Outlet docs could not be fetched from ${url}.` }], isError: true, _meta: SERVER_INFO });
    await c.close();
  });

  it("missing clientCapabilities, a version that is not a string, an unsupported version, an unknown method and an unknown tool are errors", async () => {
    const c = start();
    expect((await c.request("tools/list", modern({}, { [META.capabilities]: undefined }))).error).toEqual({ code: -32602, message: `Invalid params: ${META.capabilities}` });
    expect((await c.request("tools/list", modern({}, { [META.version]: 7 }))).error).toEqual({ code: -32602, message: `Invalid params: ${META.version}` });
    for (const requested of ["1900-01-01", "2025-11-25"]) {
      expect((await c.request("server/discover", modern({}, { [META.version]: requested }))).error)
        .toEqual({ code: -32022, message: "Unsupported protocol version", data: { supported: ["2026-07-28"], requested } });
    }
    expect((await c.request("resources/list", modern())).error).toEqual({ code: -32601, message: "Method not found: resources/list" });
    expect((await c.request("initialize", modern({ protocolVersion: "2025-06-18", capabilities: {} }))).error?.code).toBe(-32601);
    expect((await c.request("tools/call", modern({ name: "outlet_secrets" }))).error).toEqual({ code: -32602, message: "Unknown tool: outlet_secrets" });
    await c.close();
    expect(c.received).toHaveLength(7);
  });

  it("a modern notification gets no reply", async () => {
    const c = start();
    c.raw(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: modern({ requestId: 1 }) }));
    expect((await c.request("tools/list", modern())).result.resultType).toBe("complete");
    await c.close();
    expect(c.received).toHaveLength(1);
  });
});

describe("both eras on one process", () => {
  it("initialize, then a modern tools/list, a legacy tools/list and a modern server/discover", async () => {
    const c = start();
    const init = await c.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.result).toEqual({ protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "outlet", version: pkg.version } });
    c.raw(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect((await c.request("tools/list", modern())).result).toEqual({ resultType: "complete", tools: TOOLS, _meta: SERVER_INFO, ...CACHE });
    expect((await c.request("tools/list")).result).toEqual({ tools: TOOLS });
    expect((await c.request("server/discover", modern())).result).toEqual({
      resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} }, _meta: SERVER_INFO, instructions: INSTRUCTIONS, ...CACHE,
    });
    expect((await c.request("server/discover")).error?.code).toBe(-32601);
    expect(await c.close()).toBe(0);
    expect(c.stderr.join("")).toBe("");
    expect(c.received).toHaveLength(5);
  });

  it("a modern request first, then initialize, then a legacy call", async () => {
    const c = start();
    expect((await c.request("server/discover", modern())).result.resultType).toBe("complete");
    expect((await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} })).result.protocolVersion).toBe("2025-06-18");
    expect((await c.request("tools/call", { name: "outlet_setup_prompt", arguments: {} })).result).toEqual({ content: [{ type: "text", text: SETUP_PROMPT }] });
    expect(await c.close()).toBe(0);
    expect(c.stderr.join("")).toBe("");
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
