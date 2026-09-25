#!/usr/bin/env node
/**
 * The @useoutlet/sdk command. `npx @useoutlet/sdk mcp` runs the docs server
 * over stdio (see mcp.ts). No argument prints the help and exits 0. An
 * unknown argument prints the same help to stderr and exits 1.
 */
import { readFileSync } from "node:fs";
import { serve } from "./mcp.js";

const HELP = `Usage: npx @useoutlet/sdk mcp    runs the Outlet docs server for AI coding tools (MCP over stdio)
Docs: https://useoutlet.dev/docs/
`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "mcp" && rest.length === 0) {
  serve(version());
} else if (command === undefined || command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(HELP);
} else {
  process.stderr.write(HELP);
  process.exitCode = 1;
}
