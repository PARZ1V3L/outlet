/**
 * The grant calls after connect: refresh, revoke, status (SPEC §7). Kept
 * apart from index.ts so the fetch wrapper can ask status() without a
 * circular import. A connection that has ended answers as a
 * ConnectionEndedError from status() and refresh() (ended.ts).
 */
import { assertVaultGrant } from "./direct.js";
import { endedFromInfo, endedFromVault } from "./ended.js";
import { DEFAULT_BASE_URL, api, type Auth } from "./http.js";
import { GrantInfo, OutletError, OutletSession, RequestOptions } from "./types.js";

/** Confidential clients authenticate with the app secret; public clients
 *  (PKCE, SPEC §7.1) carry a grant-scoped refresh token instead. */
export function authOf(opts: RequestOptions): Auth {
  return opts.refreshToken
    ? { bearer: opts.refreshToken }
    : { appSecret: opts.appSecret };
}

/** A vault refusal that means the connection ended becomes the typed
 *  error; every other refusal passes through as it was. */
function surfaced(e: unknown, grantId: string): unknown {
  return (e instanceof OutletError && endedFromVault(e, grantId)) || e;
}

/**
 * Re-fetch (and possibly rotate) keys for an existing grant. Server-side
 * for confidential clients. Public clients (RequestOptions.refreshToken)
 * get a ROTATED token back (OAuth 2.1 §6.1): the token they presented is
 * void the moment the vault answers, so callers MUST persist the returned
 * refreshToken before making another call — the old one now 401s.
 * Throws ConnectionEndedError when the connection is capped, revoked, or
 * the token no longer refreshes it.
 */
export async function refresh(
  grantId: string,
  opts: RequestOptions = {},
): Promise<OutletSession & { refreshToken?: string }> {
  assertVaultGrant(grantId);
  let r: OutletSession & { refresh_token?: string };
  try {
    r = await api<OutletSession & { refresh_token?: string }>(
      opts.baseUrl ?? DEFAULT_BASE_URL,
      `/grants/${grantId}/refresh`, { method: "POST" }, authOf(opts));
  } catch (e) {
    throw surfaced(e, grantId);
  }
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
 * minutes stale, 0 for a grant not yet metered. A connection that has
 * ended throws ConnectionEndedError instead (its `info` holds the answer),
 * so an app never reads a capped or revoked connection as one to keep
 * calling with.
 */
export async function status(
  grantId: string,
  opts: RequestOptions = {},
): Promise<GrantInfo> {
  assertVaultGrant(grantId);
  let info: GrantInfo;
  try {
    info = await api<GrantInfo>(opts.baseUrl ?? DEFAULT_BASE_URL,
      `/grants/${grantId}/status`, undefined, authOf(opts));
  } catch (e) {
    throw surfaced(e, grantId);
  }
  const end = endedFromInfo(info);
  if (end) throw end;
  return info;
}
