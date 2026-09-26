/**
 * The optional fetch wrapper. An app keeps calling the provider with the
 * provider's own SDK; it only hands that SDK this fetch. A provider answer
 * of 401, 402, 403 or 429 on a Vault session becomes one status() check:
 * a connection that has ended throws ConnectionEndedError, and a
 * connection still open hands the provider's answer back untouched (the
 * provider's own rate limit, say). On a Direct session a 401 is the
 * provider refusing the pasted key: ConnectionEndedError with reason
 * "refused". Outlet stays out of the data path: the wrapper reads no
 * request and no response body.
 *
 *   const ai = new OpenAI({
 *     apiKey: session.keys.openai,
 *     fetch: Outlet.wrapFetch({ session: () => session }),
 *   });
 */
import { ended } from "./ended.js";
import { status } from "./grants.js";
import { ConnectionEndedError, type OutletSession, type Provider, type RequestOptions } from "./types.js";

export interface WrapFetchOptions extends RequestOptions {
  /** The session the app holds, or a function that returns the current
   *  one: a public client's refresh token rotates, so read it when
   *  needed, not when the wrapper is made. */
  session: OutletSession | (() => OutletSession | null | undefined);
  /** The fetch to wrap. Defaults to the global one, read at call time. */
  fetch?: typeof fetch;
}

const CHECKED = new Set([401, 402, 403, 429]);

function providerOf(s: OutletSession): Provider | undefined {
  return Object.keys(s.keys ?? {})[0];
}

export function wrapFetch(o: WrapFetchOptions): typeof fetch {
  return async (input, init) => {
    const base = o.fetch ?? globalThis.fetch;
    const res = await base(input, init);
    if (!CHECKED.has(res.status)) return res;
    const s = typeof o.session === "function" ? o.session() : o.session;
    if (!s || typeof s.grantId !== "string") return res;
    if (s.mode === "direct" || s.grantId.startsWith("direct_")) {
      if (res.status !== 401) return res;
      throw ended("refused", s.grantId, { provider: providerOf(s), status: 401 });
    }
    try {
      await status(s.grantId, {
        refreshToken: (s as { refreshToken?: string }).refreshToken ?? o.refreshToken,
        appSecret: o.appSecret,
        baseUrl: o.baseUrl,
      });
    } catch (e) {
      if (e instanceof ConnectionEndedError) throw e;
      // The vault could not say (unreachable, or the app's own mistake):
      // the provider's answer stands, as it would without the wrapper.
    }
    return res;
  };
}
