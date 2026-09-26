#!/usr/bin/env node
/**
 * The README's quickstart, as printed (the CI job "quickstart").
 *
 * Reads the "## Quickstart" section of sdk/README.md and takes its three
 * code blocks verbatim: the install line, the page, the build line. In a
 * fresh folder it runs the install line with one substitution, the path of
 * the tarball `npm pack` made of this checkout in place of the package
 * name, so the page runs this branch's SDK and not the published one.
 * Then it writes the page as index.html, runs the printed build line (the
 * folder holds a pinned Vite, so `npx vite build` resolves to it), serves
 * the built page on 127.0.0.1, loads it in headless Chrome over the
 * DevTools protocol with every other host unresolvable, and checks that
 * the Connect your AI button rendered with no console error, no uncaught
 * exception and no request to any other host.
 *
 *   node scripts/quickstart-as-printed.mjs [useoutlet-sdk-x.y.z.tgz]
 *
 * Chrome: $CHROME, else the platform's Google Chrome or Chromium. Vite is
 * pinned in VITE below; bump it on purpose, with the README, not by chance.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VITE = "8.3.1";
const sdk = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log("[quickstart]", ...a);
const fail = (why) => { console.error("[quickstart] FAIL:", why); process.exit(1); };

// 1. The printed blocks.
const readme = readFileSync(join(sdk, "README.md"), "utf8");
const start = readme.indexOf("\n## Quickstart\n");
if (start < 0) fail("README.md has no '## Quickstart' section");
const rest = readme.slice(start + "\n## Quickstart\n".length);
const stop = rest.search(/\n##+ /);
const section = stop < 0 ? rest : rest.slice(0, stop);
const blocks = [...section.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], code: m[2] }));
const [install, page, build] = blocks;
if (blocks.length !== 3 || install.lang !== "sh" || page.lang !== "html" || build.lang !== "sh") {
  fail(`expected three blocks (sh, html, sh) in the Quickstart section, found ${blocks.map((b) => b.lang).join(", ")}`);
}
const installLine = install.code.trim();
const buildLine = build.code.trim();
if (!/^npm install @useoutlet\/sdk$/.test(installLine)) fail(`unexpected install line: ${installLine}`);
if (!/^npx vite build$/.test(buildLine)) fail(`unexpected build line: ${buildLine}`);

// 2. The tarball of this checkout.
const tarball = resolve(process.argv[2] ?? readdirSync(sdk).filter((f) => /^useoutlet-sdk-.*\.tgz$/.test(f)).map((f) => join(sdk, f))[0] ?? "");
if (!tarball || !existsSync(tarball)) fail("no useoutlet-sdk-*.tgz in sdk/: run `npm run build && npm pack --ignore-scripts` first");

// 3. A fresh folder, the printed commands.
const dir = mkdtempSync(join(tmpdir(), "outlet-quickstart-"));
const sh = (cmd) => { log("$", cmd); execSync(cmd, { cwd: dir, stdio: "inherit", env: { ...process.env, CI: "1" } }); };
writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "quickstart-as-printed", private: true, type: "module" }, null, 2));
const substituted = installLine.replace("@useoutlet/sdk", JSON.stringify(tarball));
log(`install line as printed: ${installLine}; run with the tarball: ${substituted}`);
sh(substituted);
sh(`npm install --no-save --no-audit --no-fund vite@${VITE}`);
writeFileSync(join(dir, "index.html"), page.code);
sh(buildLine);
const dist = join(dir, "dist");
if (!existsSync(join(dist, "index.html"))) fail("the build produced no dist/index.html");

// 4. Serve the built page on the loopback.
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const served = [];
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  // Chrome asks for a favicon on its own; the printed page has none to give.
  if (path === "/favicon.ico") { res.writeHead(204).end(); return; }
  let file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) { res.writeHead(404).end(); served.push(`404 ${path}`); return; }
  served.push(path);
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// 5. Chrome over the DevTools protocol, nothing but the loopback resolvable.
const candidates = process.env.CHROME ? [process.env.CHROME] : process.platform === "darwin"
  ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
  : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
const chromeBin = candidates.find((c) => c.includes("/") ? existsSync(c) : which(c));
function which(name) { try { return execSync(`command -v ${name}`, { stdio: "pipe" }).toString().trim() !== ""; } catch { return false; } }
if (!chromeBin) fail(`no Chrome found; set CHROME (tried ${candidates.join(", ")})`);
const profile = mkdtempSync(join(tmpdir(), "outlet-quickstart-chrome-"));
const chrome = spawn(chromeBin, [
  "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--no-sandbox",
  `--user-data-dir=${profile}`, "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
const die = (why) => { chrome.kill("SIGKILL"); server.close(); fail(why); };
setTimeout(() => die("watchdog: 90 s"), 90_000).unref();
const wsUrl = await new Promise((res, rej) => {
  let buf = "";
  chrome.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  chrome.on("exit", (c) => rej(new Error(`chrome exited ${c}\n${buf}`)));
}).catch((e) => die(e.message));
const targets = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }).catch(() => die("could not attach to Chrome"));
let id = 0; const pending = new Map(); const waiters = new Set();
const problems = []; const requests = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`);
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "assert")) problems.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") problems.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
  if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
  for (const w of waiters) w(m);
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const waitEvent = (method) => new Promise((res) => { const w = (m) => { if (m.method === method) { waiters.delete(w); res(m); } }; waiters.add(w); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
  const loaded = waitEvent("Page.loadEventFired");
  await send("Page.navigate", { url: `${origin}/` });
  await loaded;
  await new Promise((r) => setTimeout(r, 500));
  const label = await evalJs('document.getElementById("connect")?.shadowRoot?.querySelector("button")?.getAttribute("aria-label") ?? null');
  // Chrome's own pages (about:, chrome-error:, data: images) are not the page's requests.
  const foreign = requests.filter((u) => /^https?:/.test(u) && !u.startsWith(origin));
  log(`served: ${served.join(", ") || "(nothing)"}`);
  if (!served.length) problems.push("the page was never fetched from the loopback server");
  if (label !== "Connect your AI") problems.push(`the Connect your AI button did not render (aria-label: ${JSON.stringify(label)})`);
  if (foreign.length) problems.push(`requests left the page: ${foreign.join(", ")}`);
  if (problems.length) die(problems.join("\n  "));
  log(`PASS: the printed page renders the Connect your AI button from ${tarball.split("/").pop()} with no console errors (${requests.length} requests, all on ${origin})`);
} catch (e) {
  die(e.message);
}
ws.close(); chrome.kill("SIGKILL"); server.close();
