/**
 * Where a ChatGPT plan sign-in is kept. The default is one file under the
 * user's own config folder, owner-only, written atomically. An app can hand
 * in its own store instead (a keychain, say). The refresh token lives here
 * and never on the session object.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OutletError } from "../types.js";
import { WORDS } from "./words.js";

/** One app's saved sign-in. Everything after `hostId` arrives with the sign-in. */
export interface PlanRecord {
  provider: "openai";
  appName: string;
  /** This install's host id at OpenAI (`ext_agent_host_id`). Made before the
   *  first sign-in and kept. An identifier, not a secret. */
  hostId: string;
  /** The client id OpenAI issued when the user first approved the app. */
  clientId?: string;
  /** The session's local handle (`plan_…`). Not a secret. */
  grantId?: string;
  issuer?: string;
  /** The verified ID token's `sub`: the account this sign-in belongs to. */
  subject?: string;
  email?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  /** ISO 8601: the access token's own expiry. */
  expiresAt?: string;
  /** ISO 8601: when OpenAI says a refresh is due (`earliest_refresh_at`). */
  earliestRefreshAt?: string;
  savedAt?: string;
}

export interface PlanStore {
  load(): Promise<PlanRecord | null>;
  /** Must not resolve until the record is safely kept: a rotated refresh
   *  token exists nowhere else. A save that fails must throw. */
  save(record: PlanRecord): Promise<void>;
  clear(): Promise<void>;
  /** Optional: hold the store against other processes while a refresh
   *  rotates the token. Resolves to the release. The file store has one. */
  lock?(): Promise<() => Promise<void>>;
}

/** The app name as a folder name: lowercase letters, digits and dashes. A
 *  name with none of those gets a short hash instead. */
export function safeFolderName(appName: string): string {
  const safe = appName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return safe || `app-${createHash("sha256").update(appName).digest("hex").slice(0, 12)}`;
}

function storeError(e: unknown): OutletError {
  if (e instanceof OutletError) return e;
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return new OutletError(WORDS.store(typeof code === "string" ? code : "unreadable"), "plan_store_failed");
}

const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

/**
 * The default store: `~/.config/<app folder>/outlet-plan.json`. The folder
 * is 0700 and the file 0600. A write goes to a new file in the same folder,
 * then replaces the old one in one step. `dir` moves the folder.
 */
export function planFileStore(appName: string, o: { dir?: string } = {}): PlanStore & { path: string } {
  const path = join(o.dir ?? join(homedir(), ".config", safeFolderName(appName)), "outlet-plan.json");
  const folder = dirname(path);
  const lockPath = `${path}.lock`;

  async function ensureFolder(): Promise<void> {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await chmod(folder, 0o700);
  }

  return {
    path,
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw storeError(e);
      }
      try {
        // A file someone opened up is closed again before it is trusted.
        if (process.platform !== "win32" && ((await stat(path)).mode & 0o077) !== 0) await chmod(path, 0o600);
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || typeof (parsed as PlanRecord).hostId !== "string") {
          throw new OutletError(WORDS.store("unreadable"), "plan_store_failed");
        }
        return parsed as PlanRecord;
      } catch (e) {
        throw storeError(e);
      }
    },
    async save(record) {
      const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        await ensureFolder();
        const file = await open(tmp, "wx", 0o600);
        try {
          await file.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(tmp, path);
        await chmod(path, 0o600);
      } catch (e) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw storeError(e);
      }
    },
    async clear() {
      try {
        await rm(path, { force: true });
        await rm(lockPath, { force: true });
      } catch (e) {
        throw storeError(e);
      }
    },
    async lock() {
      const started = Date.now();
      for (;;) {
        try {
          await ensureFolder();
          await (await open(lockPath, "wx", 0o600)).close();
          return async () => {
            await unlink(lockPath).catch(() => undefined);
          };
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw storeError(e);
        }
        // A lock left by a process that died is taken over.
        const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (age > LOCK_STALE_MS) await unlink(lockPath).catch(() => undefined);
        else if (Date.now() - started > LOCK_WAIT_MS) throw new OutletError(WORDS.store("locked"), "plan_store_failed");
        else await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}
