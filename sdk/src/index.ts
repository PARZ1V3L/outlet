/**
 * @useoutlet/sdk — connect your users' AI accounts to your app.
 *
 * Status: direct mode is live today. Vault mode (connect / refresh / status /
 * revoke) is in early access — email hello@useoutlet.dev to register your app.
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
 */

import {
  ConnectOptions,
  GrantInfo,
  OutletSession,
  RequestOptions,
} from "./types.js";
import { DEFAULT_BASE_URL, api, type Auth } from "./http.js";
import { assertVaultGrant, direct } from "./direct.js";
import { connectRedirect, handleRedirect } from "./pkce.js";

export * from "./types.js";
export { direct, type DirectOptions } from "./direct.js";
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

/** Confidential clients authenticate with the app secret; public clients
 *  (PKCE, SPEC §7.1) carry a grant-scoped refresh token instead. */
function authOf(opts: RequestOptions): Auth {
  return opts.refreshToken
    ? { bearer: opts.refreshToken }
    : { appSecret: opts.appSecret };
}

/**
 * Begin the connect flow. In browsers this opens the Outlet grant screen
 * (popup or redirect) where the user approves your app and a spend cap;
 * it resolves once the grant completes.
 */
export async function connect(opts: ConnectOptions): Promise<OutletSession> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  // vault mode: server-driven grant flow (in early access).
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

  // Poll until the user approves (or the request expires server-side).
  for (;;) {
    const result = await api<
      | { status: "pending" }
      | ({ status: "complete" } & OutletSession)
    >(baseUrl, `/grants/${grantRequestId}`);
    if (result.status === "complete") return result;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Re-fetch (and possibly rotate) keys for an existing grant. Server-side
 * for confidential clients. Public clients (RequestOptions.refreshToken)
 * get a ROTATED token back (OAuth 2.1 §6.1): the token they presented is
 * void the moment the vault answers, so callers MUST persist the returned
 * refreshToken before making another call — the old one now 401s.
 */
export async function refresh(
  grantId: string,
  opts: RequestOptions = {},
): Promise<OutletSession & { refreshToken?: string }> {
  assertVaultGrant(grantId);
  const r = await api<OutletSession & { refresh_token?: string }>(
    opts.baseUrl ?? DEFAULT_BASE_URL,
    `/grants/${grantId}/refresh`, { method: "POST" }, authOf(opts));
  // why the rename: the wire is snake_case (SPEC §7.1); the SDK surface is
  // camelCase. Dropping the rotated token here stranded public clients —
  // their stored token was already voided server-side (security review).
  const { refresh_token, ...session } = r;
  return refresh_token ? { ...session, refreshToken: refresh_token } : session;
}

/** App-initiated revocation (users can always revoke from their dashboard). */
export async function revoke(
  grantId: string,
  opts: RequestOptions = {},
): Promise<void> {
  assertVaultGrant(grantId);
  await api<unknown>(opts.baseUrl ?? DEFAULT_BASE_URL,
    `/grants/${grantId}`, { method: "DELETE" }, authOf(opts));
}

/**
 * Current status + spend for a grant. A pure read: the vault's /status
 * endpoint never returns key material (the old GET /grants/:id habit
 * re-delivered the full key on every status poll — security review).
 * spendUsd is the vault's last meter reading: month-to-date, up to ~5
 * minutes stale, 0 for a grant not yet metered.
 */
export async function status(
  grantId: string,
  opts: RequestOptions = {},
): Promise<GrantInfo> {
  assertVaultGrant(grantId);
  return api<GrantInfo>(opts.baseUrl ?? DEFAULT_BASE_URL,
    `/grants/${grantId}/status`, undefined, authOf(opts));
}

const Outlet = {
  connect,
  connectRedirect,
  handleRedirect,
  direct,
  refresh,
  revoke,
  status,
};
export default Outlet;
