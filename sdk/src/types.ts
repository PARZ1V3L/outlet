/** Outlet SDK — core types (spec §7) */
import type { ProviderId } from "./providers.js";

/**
 * Provider key namespace. The named ids are the provider registry's
 * (providers.ts): each has a named Direct screen in the Connect your AI
 * button. Any other string is accepted too. OpenAI, Anthropic and Google
 * get strict key-format validation. Every other provider's key is an
 * opaque value: your app calls that provider with its own SDK, or with the
 * OpenAI SDK and the provider's `baseURL` where the registry marks it
 * `openaiCompatible`.
 */
export type Provider =
  | ProviderId
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type GrantStatus = "active" | "capped" | "revoked" | "pending";

/** Options shared by all grant operations. */
export interface RequestOptions {
  /**
   * Your confidential app secret (apps_…) issued at registration. Required
   * by the vault's registry gate (SPEC §6.1). SERVER-SIDE ONLY — never ship
   * it in client bundles.
   */
  appSecret?: string;
  /**
   * Grant-scoped refresh token from the public-client (PKCE) flow, returned
   * by handleRedirect()/exchangeCode(). Authenticates refresh/status/revoke
   * for public clients in place of the server-side appSecret (SPEC §7.1).
   */
  refreshToken?: string;
  /** Override the Outlet API base URL (e.g. staging). */
  baseUrl?: string;
}

export interface ConnectOptions extends RequestOptions {
  /** Your app's registered Outlet ID (app_… — public, embeddable). */
  appId: string;
  /** Providers your app wants the user to connect. */
  providers: Provider[];
  /**
   * Suggested monthly spend cap in USD. The user sees this on the grant
   * screen and may lower it. Defaults to the Outlet platform default ($5).
   */
  requestedCapUsd?: number;
  /** Where the browser returns after the grant screen (public clients). */
  redirectUri?: string;
}

export interface OutletSession {
  /** Durable reference to the user's grant. Store this, not the keys. */
  grantId: string;
  /**
   * Provider API keys, scoped to your app and spend-capped.
   * Inject straight into the provider's official SDK.
   * Treat as secrets: keep in memory or encrypted storage only.
   */
  keys: Partial<Record<Provider, string>>;
  /**
   * The cap the user actually approved (may be lower than requested).
   * Direct mode has no meter, so there it is `Infinity` — which
   * `JSON.stringify` turns into `null`. Check `mode` before serializing
   * a session rather than round-tripping this field through JSON.
   */
  capUsd: number;
  /** ISO 8601 expiry; call refresh() after this. */
  expiresAt: string;
  /**
   * How the session was created. "direct" = user-pasted key validated
   * locally (no vault, no cap metering). "vault" = a capped, revocable
   * App key provisioned by the Outlet vault. Absent = vault.
   */
  mode?: "direct" | "vault";
}

export interface GrantInfo {
  grantId: string;
  status: GrantStatus;
  providers: Provider[];
  capUsd: number;
  /** Spend so far this billing period, USD-normalized. */
  spendUsd: number;
  /**
   * Why a capped grant stopped. Present only when `status` is "capped":
   * "spend" (its monthly cap), "unreadable" (the meter could not read the
   * provider's usage for an hour) or "currency" (the provider reports the
   * account's usage in a currency other than USD).
   */
  reason?: "spend" | "unreadable" | "currency";
}

export class OutletError extends Error {
  constructor(
    message: string,
    /** Machine-readable code, e.g. "grant_revoked", "cap_reached". */
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OutletError";
  }
}

/** Why a connection ended. */
export type EndReason = "capped" | "revoked" | "expired" | "refused";

/** What a developer reads in the stack trace, by reason. Wording: Parz's
 *  word pass (NEVER-DEAD-END-2026-09-26). */
const ENDED_MESSAGES: Record<EndReason, string> = {
  capped: "This Vault connection is paused at its cap. When the user raises the cap on useoutlet.dev, refresh() returns the key.",
  revoked: "This Vault connection was revoked. Ask the user to connect again.",
  expired: "This Vault connection can no longer be refreshed. Ask the user to connect again.",
  refused: "The provider refused this Direct API key. Ask the user for a new one.",
};

/**
 * A connection the app can no longer use. `reason` says why: the Vault
 * connection is paused at its cap ("capped"), was revoked or disconnected
 * ("revoked"), can no longer be refreshed because its refresh token is
 * gone ("expired"), or the provider refused the Direct API key ("refused").
 * Thrown by status(), refresh() and the fetch from wrapFetch(). On a page,
 * the Connect your AI button bound to the same grant shows one screen for
 * the reason with the one thing the user can do, and onSession receives
 * the new session when they are done. `code` is "connection_ended".
 */
export class ConnectionEndedError extends OutletError {
  readonly reason: EndReason;
  readonly grantId: string;
  /** The vault's answer, when status() gave one (capped and revoked). */
  readonly info?: GrantInfo;
  /** The provider the key belonged to, when known. */
  readonly provider?: Provider;
  constructor(
    reason: EndReason,
    grantId: string,
    extra: { info?: GrantInfo; provider?: Provider; status?: number; message?: string } = {},
  ) {
    super(extra.message ?? ENDED_MESSAGES[reason], "connection_ended", extra.status);
    this.name = "ConnectionEndedError";
    this.reason = reason;
    this.grantId = grantId;
    if (extra.info) this.info = extra.info;
    if (extra.provider) this.provider = extra.provider;
  }
}
