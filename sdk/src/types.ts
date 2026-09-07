/** Outlet SDK — core types (spec §7) */

/**
 * Provider key namespace for direct mode. OpenAI, Anthropic, and Google get
 * strict key-format validation; any other value is treated as an
 * OpenAI-compatible provider — your app calls it with the OpenAI SDK and that
 * provider's `baseURL`. Any string is accepted, so the SDK works with the
 * whole OpenAI-compatible ecosystem (Groq, Together, OpenRouter, DeepSeek,
 * xAI, Mistral, Cerebras, Qwen, and more). The named ones are just for editor
 * autocomplete.
 */
export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "xai"
  | "deepseek"
  | "mistral"
  | "together"
  | "fireworks"
  | "cerebras"
  | "qwen"
  | "moonshot"
  | "minimax"
  | "zai"
  | "nous"
  | "meta"
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
