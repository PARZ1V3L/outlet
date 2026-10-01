/**
 * The file store (security 5) and the Node-only guard (security 6): the
 * file and its folder are owner-only, a write is atomic, a failed save is
 * an error, and a browser build gets one clear message.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planFileStore, type PlanRecord } from "../../src/plan/index.js";
import { safeFolderName } from "../../src/plan/store.js";

const posix = process.platform !== "win32";
const record: PlanRecord = {
  provider: "openai", appName: "Test App", hostId: "urn:uuid:00000000-0000-4000-8000-000000000000",
  clientId: "oaiapp_test", accessToken: "at_secret", refreshToken: "rt_secret",
};
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "outlet-plan-store-")); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

describe("where the default store lives", () => {
  it("is ~/.config/<the app name as a safe folder name>/outlet-plan.json", () => {
    vi.stubEnv("HOME", dir);
    vi.stubEnv("USERPROFILE", dir);
    expect(homedir()).toBe(dir);
    expect(planFileStore("Outlet SDK check").path).toBe(join(dir, ".config", "outlet-sdk-check", "outlet-plan.json"));
  });
  it("makes a folder name out of any app name", () => {
    expect(safeFolderName("Paste Perfect")).toBe("paste-perfect");
    expect(safeFolderName("  ../../etc/passwd  ")).toBe("etc-passwd");
    expect(safeFolderName("Café Señor 2")).toBe("cafe-senor-2");
    expect(safeFolderName("C:\\Users\\x")).toBe("c-users-x");
    expect(safeFolderName("日本語")).toMatch(/^app-[0-9a-f]{12}$/);
    expect(safeFolderName("a".repeat(200)).length).toBe(64);
    for (const name of ["..", "/", ".", "~"]) expect(safeFolderName(name)).toMatch(/^app-[0-9a-f]{12}$/);
  });
});

describe("security 5: the file store", () => {
  it.runIf(posix)("the file is owner-only and its folder is owner-only", async () => {
    const store = planFileStore("Test App", { dir: join(dir, "nested", "app") });
    await store.save(record);
    expect(statSync(store.path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(store.path)).mode & 0o777).toBe(0o700);
    // A folder that was already there, and open, is closed.
    const open = join(dir, "open");
    const second = planFileStore("Test App", { dir: open });
    await second.save(record);
    chmodSync(open, 0o755);
    await second.save(record);
    expect(statSync(open).mode & 0o777).toBe(0o700);
  });

  it.runIf(posix)("a file someone opened up is closed again on load", async () => {
    const store = planFileStore("Test App", { dir });
    await store.save(record);
    chmodSync(store.path, 0o644);
    expect(await store.load()).toEqual(record);
    expect(statSync(store.path).mode & 0o777).toBe(0o600);
  });

  it("a write is atomic: a whole new file replaces the old one and nothing is left behind", async () => {
    const store = planFileStore("Test App", { dir });
    await store.save(record);
    const first = statSync(store.path).ino;
    await store.save({ ...record, refreshToken: "rt_rotated" });
    expect(statSync(store.path).ino).not.toBe(first);
    expect(JSON.parse(readFileSync(store.path, "utf8"))).toEqual({ ...record, refreshToken: "rt_rotated" });
    expect(readdirSync(dir)).toEqual(["outlet-plan.json"]);
  });

  it("a failed save is an error, never a silent pass, and the old record stands", async () => {
    // The folder cannot be made: a file sits where it should go.
    writeFileSync(join(dir, "blocked"), "x");
    const blocked = planFileStore("Test App", { dir: join(dir, "blocked", "app") });
    const e = await blocked.save(record).catch((x) => x);
    expect(e).toMatchObject({ code: "plan_store_failed" });
    expect(e.message).toMatch(/^The ChatGPT plan sign-in could not be saved or read \((ENOTDIR|EEXIST)\)\.$/);
    expect(e.message).not.toContain("rt_secret");

    // A save that fails part way leaves the old record whole and no stray file.
    const store = planFileStore("Test App", { dir });
    await store.save(record);
    const circular: PlanRecord & { self?: unknown } = { ...record, refreshToken: "rt_never_written" };
    circular.self = circular;
    await expect(store.save(circular)).rejects.toMatchObject({ code: "plan_store_failed" });
    expect(await store.load()).toEqual(record);
    expect(readdirSync(dir).sort()).toEqual(["blocked", "outlet-plan.json"]);
  });

  it("load is null with no file, and an unreadable file is an error", async () => {
    const store = planFileStore("Test App", { dir });
    expect(await store.load()).toBeNull();
    writeFileSync(store.path, "{ not json", { mode: 0o600 });
    await expect(store.load()).rejects.toMatchObject({ code: "plan_store_failed" });
    writeFileSync(store.path, JSON.stringify({ some: "other file" }), { mode: 0o600 });
    await expect(store.load()).rejects.toMatchObject({ code: "plan_store_failed" });
  });

  it("clear deletes the record", async () => {
    const store = planFileStore("Test App", { dir });
    await store.save(record);
    await store.clear();
    expect(existsSync(store.path)).toBe(false);
    expect(await store.load()).toBeNull();
    await store.clear(); // nothing there: still fine
  });

  it("the lock is held by one caller at a time", async () => {
    const a = planFileStore("Test App", { dir });
    const b = planFileStore("Test App", { dir });
    const order: string[] = [];
    const release = await a.lock!();
    const second = b.lock!().then((r) => { order.push("b has it"); return r; });
    await new Promise((r) => setTimeout(r, 120));
    order.push("a lets go");
    await release();
    await (await second)();
    expect(order).toEqual(["a lets go", "b has it"]);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("security 6: importing the entry in a browser build fails with a clear message", () => {
  const WORDS = "@useoutlet/sdk/plan runs on the user's own machine, in Node. It cannot run in a browser page.";
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

  it("the package hands a browser build the module that refuses", async () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.exports["./plan"]).toEqual({
      types: "./dist/plan/index.d.ts",
      browser: "./dist/plan/browser.js",
      default: "./dist/plan/index.js",
    });
    // "browser" must come before "default": conditions match in order.
    expect(Object.keys(pkg.exports["./plan"]).indexOf("browser")).toBeLessThan(Object.keys(pkg.exports["./plan"]).indexOf("default"));
    await expect(import("../../src/plan/browser.js")).rejects.toMatchObject({ code: "plan_node_only", message: WORDS });
  });

  it("the Node entry refuses too when it finds itself in a page", async () => {
    vi.resetModules();
    vi.stubGlobal("document", {});
    await expect(import("../../src/plan/index.js")).rejects.toMatchObject({ code: "plan_node_only", message: WORDS });
  });

  it("the browser module names everything the entry exports as a value, and nothing from Node", async () => {
    const browser = readFileSync(join(root, "src/plan/browser.ts"), "utf8");
    expect(browser).not.toMatch(/from "node:/);
    const entry = await import("../../src/plan/index.js");
    for (const name of Object.keys(entry)) expect(browser).toContain(`export const ${name} = refuse;`);
  });

  it("the other entries import nothing from the plan entry and nothing from Node", () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/(?:import|export)\s[^;]*?from\s+"([^"]+)"|import\(\s*"([^"]+)"\s*\)/g)) {
        const spec = (m[1] ?? m[2]) as string;
        expect(spec.startsWith("node:"), `${file} imports ${spec}`).toBe(false);
        if (!spec.startsWith(".")) continue;
        const base = resolve(dirname(file), spec.replace(/\.js$/, ""));
        const target = [`${base}.ts`, `${base}.tsx`].find((p) => existsSync(p));
        expect(target, `${file} imports ${spec}`).toBeDefined();
        walk(target as string);
      }
    };
    for (const entry of ["src/index.ts", "src/ui/index.ts", "src/react/index.ts", "src/vue/index.ts"]) walk(join(root, entry));
    expect(seen.size).toBeGreaterThan(10);
    const plan = join(root, "src", "plan");
    expect([...seen].filter((f) => f.startsWith(plan + "/") || f.startsWith(plan + "\\"))).toEqual([]);
    // The pure half the fetch wrapper uses is reached, and it is not the entry.
    expect(seen.has(join(root, "src", "plan-ends.ts"))).toBe(true);
  });
});
