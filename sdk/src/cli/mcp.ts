/**
 * `npx @useoutlet/sdk mcp`: the Outlet docs server for AI coding tools. A
 * stdio MCP server with no dependencies: JSON-RPC 2.0, one message per line,
 * over stdin and stdout. Anything logged goes to stderr. Two tools:
 * outlet_docs serves https://useoutlet.dev/llms-full.txt, fetched once per
 * process, and outlet_setup_prompt serves SETUP_PROMPT. OUTLET_DOCS_URL
 * points the docs tool elsewhere, an http(s) or file: URL, so tests read a
 * local file and touch no network.
 *
 * The server speaks two eras of the protocol on one process, in any order,
 * the era decided per request. A request that carries
 * params._meta["io.modelcontextprotocol/protocolVersion"] is modern, the
 * 2026-07-28 revision: no handshake, nothing remembered between requests,
 * server/discover for the server's identity, every result carrying
 * resultType and the server's name, and caching hints on server/discover
 * and tools/list. Any other request is legacy, the
 * initialize handshake of 2025-11-25 and earlier, answered exactly as before
 * with nothing added. A client of both eras probes with server/discover and
 * gets the DiscoverResult; a legacy client sends initialize and never sees
 * the modern fields.
 */
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { SETUP_PROMPT } from "./prompt.js";

export const DOCS_URL = "https://useoutlet.dev/llms-full.txt";
/** The revisions this server speaks, newest first: modern ones name their
 *  version on every request, legacy ones negotiate it in initialize. */
export const PROTOCOL_VERSIONS = {
  modern: ["2026-07-28"],
  legacy: ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"],
};
/** The reserved _meta keys the modern era uses. */
const META = {
  version: "io.modelcontextprotocol/protocolVersion",
  capabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
};
/** What server/discover tells an AI tool about this server. */
const INSTRUCTIONS = "Outlet adds the Connect your AI button to a web app. Call outlet_docs for the docs and outlet_setup_prompt for the setup steps.";
/** The caching hints the revision requires on server/discover and tools/list:
 *  the same for every caller, fresh for an hour (the tools change only with the package). */
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" };

const TOOLS = [
  {
    name: "outlet_docs",
    description: "The current Outlet docs in one file.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "outlet_setup_prompt",
    description: "The setup prompt: how to add the Connect your AI button.",
    inputSchema: { type: "object", properties: {} },
  },
];

type Id = string | number | null;
type Params = Record<string, unknown>;
interface Message { jsonrpc?: unknown; id?: Id; method?: unknown; params?: unknown }
interface ToolResult { content: { type: "text"; text: string }[]; isError?: true }

/** A JSON-RPC error answered to the request that caused it. */
class RpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
  }
}

const isObject = (v: unknown): v is Params => typeof v === "object" && v !== null && !Array.isArray(v);
const docsUrl = (): string => process.env.OUTLET_DOCS_URL || DOCS_URL;

async function readDocs(url: string): Promise<string> {
  if (url.startsWith("file:")) return readFile(fileURLToPath(url), "utf8");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** The docs, fetched once per process. A failed fetch is not kept, so the next call tries again. */
let docs: Promise<string> | undefined;
function getDocs(): Promise<string> {
  docs ??= readDocs(docsUrl()).catch((e: unknown) => {
    docs = undefined;
    throw e;
  });
  return docs;
}

async function callTool(name: string): Promise<ToolResult> {
  if (name === "outlet_setup_prompt") return { content: [{ type: "text", text: SETUP_PROMPT }] };
  if (name === "outlet_docs") {
    try {
      return { content: [{ type: "text", text: await getDocs() }] };
    } catch (e) {
      const url = docsUrl();
      process.stderr.write(`outlet mcp: the docs could not be fetched from ${url} (${e instanceof Error ? e.message : String(e)})\n`);
      return { content: [{ type: "text", text: `The Outlet docs could not be fetched from ${url}.` }], isError: true };
    }
  }
  throw new RpcError(-32602, `Unknown tool: ${name}`);
}

/** A legacy request, no protocol version in its _meta: the handshake era, answered as before. */
async function handleLegacy(method: string, p: Params, version: string): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const asked = p.protocolVersion;
      const protocolVersion = typeof asked === "string" && PROTOCOL_VERSIONS.legacy.includes(asked) ? asked : PROTOCOL_VERSIONS.legacy[0];
      return { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "outlet", version } };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      if (typeof p.name !== "string") throw new RpcError(-32602, "Invalid params: name");
      return callTool(p.name);
    default:
      throw new RpcError(-32601, `Method not found: ${method}`);
  }
}

/** A modern request: its _meta names the revision and the client's capabilities, and every result names the server. */
async function handleModern(method: string, p: Params, meta: Params, version: string): Promise<unknown> {
  const requested = meta[META.version];
  if (typeof requested !== "string") throw new RpcError(-32602, `Invalid params: ${META.version}`);
  if (!PROTOCOL_VERSIONS.modern.includes(requested)) {
    throw new RpcError(-32022, "Unsupported protocol version", { supported: PROTOCOL_VERSIONS.modern, requested });
  }
  if (!isObject(meta[META.capabilities])) throw new RpcError(-32602, `Invalid params: ${META.capabilities}`);
  const _meta = { [META.serverInfo]: { name: "outlet", version } };
  switch (method) {
    case "server/discover":
      return { resultType: "complete", supportedVersions: PROTOCOL_VERSIONS.modern, capabilities: { tools: {} }, _meta, instructions: INSTRUCTIONS, ...CACHE };
    case "tools/list":
      return { resultType: "complete", tools: TOOLS, _meta, ...CACHE };
    case "tools/call":
      if (typeof p.name !== "string") throw new RpcError(-32602, "Invalid params: name");
      return { resultType: "complete", ...(await callTool(p.name)), _meta };
    default:
      throw new RpcError(-32601, `Method not found: ${method}`);
  }
}

/** Serve one client over stdin and stdout until stdin closes. */
export function serve(version: string): void {
  const send = (msg: unknown): void => {
    process.stdout.write(JSON.stringify(msg) + "\n");
  };
  const fail = (id: Id, code: number, message: string, data?: unknown): void =>
    send({ jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } });

  const dispatch = async (msg: Message): Promise<void> => {
    const id = msg.id ?? null;
    if (typeof msg.method !== "string") {
      if (msg.id !== undefined) fail(id, -32600, "Invalid Request");
      return;
    }
    if (msg.id === undefined) return; // a notification, of either era: never answered
    const p = isObject(msg.params) ? msg.params : {};
    const meta = isObject(p._meta) ? p._meta : undefined;
    try {
      const result = meta && META.version in meta
        ? await handleModern(msg.method, p, meta, version)
        : await handleLegacy(msg.method, p, version);
      send({ jsonrpc: "2.0", id, result });
    } catch (e) {
      if (e instanceof RpcError) fail(id, e.code, e.message, e.data);
      else fail(id, -32603, "Internal error");
    }
  };

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return fail(null, -32700, "Parse error");
    }
    if (!isObject(msg)) return fail(null, -32600, "Invalid Request");
    void dispatch(msg);
  });
  lines.on("close", () => process.exit(0));
  process.stdout.on("error", () => process.exit(0));
}
