/**
 * @useoutlet/sdk — connect your users' AI accounts to your app.
 *
 * Status: direct mode is live today. Vault mode (connect / refresh / status /
 * revoke) is open. Register your app at useoutlet.dev/register.
 *
 *   import Outlet from "@useoutlet/sdk";
 *
 *   const session = await Outlet.connect({
 *     appId: "app_yourapp",
 *     providers: ["anthropic", "openai"],
 *   });
 *
 *   // use the official provider SDK — Outlet is not in the data path
 *   const ai = new OpenAI({ apiKey: session.keys.openai });
 *
 * A connection that ends (capped, revoked, expired, or a Direct key the
 * provider refuses) is a ConnectionEndedError from status(), refresh() and
 * the optional fetch from wrapFetch(); the Connect your AI button shows
 * the one thing the user can do, and onSession receives the new session.
 */

import { ConnectOptions, OutletSession } from "./types.js";
import { DEFAULT_BASE_URL, api } from "./http.js";
import { direct } from "./direct.js";
import { refresh, revoke, status } from "./grants.js";
import { connectRedirect, handleRedirect } from "./pkce.js";
import { wrapFetch } from "./wrap-fetch.js";

export * from "./types.js";
export { direct, type DirectOptions } from "./direct.js";
export { refresh, revoke, status } from "./grants.js";
export { wrapFetch, type WrapFetchOptions } from "./wrap-fetch.js";
export { getProvider, providerIds, providers } from "./providers.js";
export type {
  KeyShape,
  ProviderCheck,
  ProviderEntry,
  ProviderId,
  ProviderKind,
} from "./providers.js";
export {
  connectRedirect,
  createGrant,
  exchangeCode,
  handleRedirect,
  pkceChallenge,
} from "./pkce.js";
export type {
  PkceCrypto,
  PublicConnectOptions,
  PublicSession,
  StartedGrant,
} from "./pkce.js";

/**
 * Begin the connect flow. In browsers this opens the Outlet grant screen
 * (popup or redirect) where the user approves your app and a spend cap;
 * it resolves once the grant completes.
 */
export async function connect(opts: ConnectOptions): Promise<OutletSession> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  // vault mode: server-driven grant flow.
  // 1. create a grant request; 2. send user to grantUrl; 3. poll for completion.
  const { grantRequestId, grantUrl } = await api<{
    grantRequestId: string;
    grantUrl: string;
  }>(baseUrl, "/grants", {
    method: "POST",
    body: JSON.stringify({
      app_id: opts.appId,
      providers: opts.providers,
      requested_cap_usd: opts.requestedCapUsd,
      redirect_uri: opts.redirectUri,
    }),
  }, { appSecret: opts.appSecret });

  if (typeof window !== "undefined") {
    window.open(grantUrl, "outlet_grant", "width=480,height=720");
  } else {
    // Non-browser environments surface the URL to present to the user.
    console.log(`[outlet] Ask the user to approve: ${grantUrl}`);
  }

  // Poll until the user approves (or the request expires server-side). The
  // poll proves itself the way the request did: the vault answers 401 to a
  // confidential app's poll without the app secret.
  for (;;) {
    const result = await api<
      | { status: "pending" }
      | ({ status: "complete" } & OutletSession)
    >(baseUrl, `/grants/${grantRequestId}`, undefined, { appSecret: opts.appSecret });
    if (result.status === "complete") return result;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const Outlet = {
  connect,
  connectRedirect,
  handleRedirect,
  direct,
  refresh,
  revoke,
  status,
  wrapFetch,
};
export default Outlet;
