/**
 * The loopback listener for one sign-in attempt. It binds 127.0.0.1 only, on
 * the path OpenAI's page gives, takes one callback and closes. The answer to
 * the browser is held until the attempt is settled, so the page it lands on
 * says what happened. That page is fixed words: it holds no token.
 */
import { createServer, type ServerResponse } from "node:http";
import { OutletError } from "../types.js";
import { PAGE_NOT_FINISHED, PAGE_SIGNED_IN, WORDS } from "./words.js";

/** OpenAI's page: only the port may vary. `/callback` does not match. */
export const CALLBACK_PATH = "/auth/callback";
/** The port OpenAI's page uses in its example. */
const FIRST_PORT = 1455;

export interface Callback {
  query: URLSearchParams;
  /** Answer the browser: the signed-in page, or the did-not-finish page. */
  finish(ok: boolean): void;
}

export interface Listener {
  redirectUri: string;
  /** The one callback. Rejects on the timeout or the caller's signal. */
  callback: Promise<Callback>;
  close(): void;
}

function page(res: ServerResponse, ok: boolean): void {
  const words = ok ? PAGE_SIGNED_IN : PAGE_NOT_FINISHED;
  res.writeHead(ok ? 200 : 400, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    connection: "close",
  });
  res.end(
    `<!doctype html><html lang="en"><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${words}</title>` +
      `<body style="font:16px system-ui,sans-serif;margin:20vh auto;max-width:28rem;padding:0 1rem;text-align:center">` +
      `<p>${words}</p></body></html>`,
  );
}

function bind(server: ReturnType<typeof createServer>, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => reject(e);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onError);
      const a = server.address();
      resolve(typeof a === "object" && a ? a.port : port);
    });
  });
}

export async function listen(o: { port?: number; timeoutMs: number; signal?: AbortSignal }): Promise<Listener> {
  if (o.signal?.aborted) throw new OutletError(WORDS.aborted, "plan_sign_in_aborted");
  let port = 0;
  let taken = false;
  let held: ServerResponse | null = null;
  let settle!: { resolve(c: Callback): void; reject(e: unknown): void };
  const callback = new Promise<Callback>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The caller may never reach its await: a rejection here is still handled.
  callback.catch(() => undefined);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (taken || req.method !== "GET" || url.pathname !== CALLBACK_PATH || req.headers.host !== `127.0.0.1:${port}`) {
      res
        .writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", connection: "close" })
        .end("Not found");
      return;
    }
    taken = true;
    held = res;
    settle.resolve({
      query: url.searchParams,
      finish(ok) {
        if (!held) return;
        held = null;
        page(res, ok);
      },
    });
  });

  try {
    port = await bind(server, o.port ?? FIRST_PORT);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || o.port !== undefined) {
      throw new OutletError(WORDS.portBusy(o.port ?? FIRST_PORT), "plan_port_busy");
    }
    try {
      port = await bind(server, 0); // any free port: OpenAI's page lets the port vary
    } catch {
      throw new OutletError(WORDS.portBusy(FIRST_PORT), "plan_port_busy");
    }
  }

  const timer = setTimeout(
    () => settle.reject(new OutletError(WORDS.timeout, "plan_sign_in_timeout")),
    o.timeoutMs,
  );
  const onAbort = () => settle.reject(new OutletError(WORDS.aborted, "plan_sign_in_aborted"));
  o.signal?.addEventListener("abort", onAbort, { once: true });

  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    callback,
    close() {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
      if (held) {
        const res = held;
        held = null;
        page(res, false);
      }
      taken = true;
      // Stop listening now. The page already written is left to flush, then
      // whatever is still open is cut, so the process is never held up.
      server.close();
      server.closeIdleConnections?.();
      setTimeout(() => server.closeAllConnections?.(), 2000).unref();
    },
  };
}
