/**
 * `npx @useoutlet/sdk mcp`: the Outlet docs server for AI coding tools. A
 * stdio MCP server with no dependencies: JSON-RPC 2.0, one message per line,
 * over stdin and stdout. Anything logged goes to stderr. Two tools:
 * outlet_docs serves https://useoutlet.dev/llms-full.txt, fetched once per
 * process, and outlet_setup_prompt serves SETUP_PROMPT. OUTLET_DOCS_URL
 * points the docs tool elsewhere, an http(s) or file: URL, so tests read a
 * local file and touch no network.
 *
 * The server speaks the initialize handshake (MCP revisions 2025-11-25 and
 * earlier). A client of the 2026-07-28 revision probes with server/discover,
 * gets the method-not-found error below, and falls back to initialize.
 */
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { SETUP_PROMPT } from "./prompt.js";

export const DOCS_URL = "https://useoutlet.dev/llms-full.txt";
/** The handshake revisions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

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
interface Message { jsonrpc?: unknown; id?: Id; method?: unknown; params?: unknown }
interface ToolResult { content: { type: "text"; text: string }[]; isError?: true }

/** A JSON-RPC error answered to the request that caused it. */
class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
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

async function handle(method: string, params: unknown, version: string): Promise<unknown> {
  const p = isObject(params) ? params : {};
  switch (method) {
    case "initialize": {
      const asked = p.protocolVersion;
      const protocolVersion = typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
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

/** Serve one client over stdin and stdout until stdin closes. */
export function serve(version: string): void {
  const send = (msg: unknown): void => {
    process.stdout.write(JSON.stringify(msg) + "\n");
  };
  const fail = (id: Id, code: number, message: string): void => send({ jsonrpc: "2.0", id, error: { code, message } });

  const dispatch = async (msg: Message): Promise<void> => {
    const id = msg.id ?? null;
    if (typeof msg.method !== "string") {
      if (msg.id !== undefined) fail(id, -32600, "Invalid Request");
      return;
    }
    if (msg.id === undefined) return; // a notification: never answered
    try {
      send({ jsonrpc: "2.0", id, result: await handle(msg.method, msg.params, version) });
    } catch (e) {
      if (e instanceof RpcError) fail(id, e.code, e.message);
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
