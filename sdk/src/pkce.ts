/**
 * Public-client grant flow — PKCE (SPEC §7.1, ADR 0005).
 *
 * For apps with no backend (SPA, mobile, CLI) and therefore no app_secret.
 * Grant creation is bound by PKCE (RFC 7636, S256); the redirect carries an
 * authorization *code*, never a key; the back-channel exchange swaps the code
 * + verifier for the session and a grant-scoped refresh token.
 *
 * Browser usage spans the redirect, so it has two entry points:
 *
 *   // on your "connect" button:
 *   await Outlet.connectRedirect({ appId, providers, redirectUri });
 *   // on the page served at redirectUri:
 *   const session = await Outlet.handleRedirect();
 *   // session.refreshToken authorizes later refresh/status/revoke.
 *
 * Non-browser clients (CLI/mobile) drive createGrant() + exchangeCode()
 * directly and persist the verifier themselves.
 */
import { ConnectOptions, OutletError, OutletSession } from "./types.js";
import { DEFAULT_BASE_URL, api } from "./http.js";

/** The two primitives PKCE needs. Browsers and Node supply them through Web
 *  Crypto on their own; a runtime without it (React Native / Hermes) hands
 *  in its own, e.g. expo-crypto. Never serialized, never sent. */
export interface PkceCrypto {
  /** Fill buf with cryptographically random bytes (crypto.getRandomValues). */
  getRandomValues(buf: Uint8Array): Uint8Array;
  /** SHA-256 of data (crypto.subtle.digest("SHA-256", data)). */
  sha256(data: Uint8Array): Promise<ArrayBuffer | Uint8Array>;
}

export interface PublicConnectOptions extends ConnectOptions {
  /** Must exactly match a redirect_uri registered for appId (SPEC §6.1). */
  redirectUri: string;
  /** Random bytes + SHA-256 for runtimes without Web Crypto (React Native:
   *  pass expo-crypto). Browsers and Node need nothing. */
  crypto?: PkceCrypto;
}

/** A started grant: where to send the user, plus the secrets to hold until
 *  the exchange. */
export interface StartedGrant {
  grantRequestId: string;
  grantUrl: string;
  /** PKCE secret — never sent until the exchange, never logged. */
  verifier: string;
  /** CSRF guard — compare against the value returned on the redirect. */
  state: string;
}

/** Session plus the grant-scoped refresh token that authorizes later
 *  refresh/status/revoke (pass it as RequestOptions.refreshToken). */
export type PublicSession = OutletSession & { refreshToken: string };

const STORE_KEY = "outlet:pkce";

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Web Crypto when the runtime has it. Read at call time, not import time:
 *  a phone app must fail on the call it can fix, not on `import`. */
function webCrypto(): PkceCrypto | null {
  const c = globalThis.crypto;
  if (!c || !c.subtle) return null;
  return {
    getRandomValues: (buf) => c.getRandomValues(buf),
    // Copied onto a plain ArrayBuffer: digest() takes only those (a view
    // over a SharedArrayBuffer is refused), and the caller's bytes may
    // sit on anything.
    sha256: (data) => c.subtle.digest("SHA-256", new Uint8Array(data)),
  };
}

function resolveCrypto(c?: PkceCrypto): PkceCrypto {
  const impl = c ?? webCrypto();
  if (!impl) {
    throw new OutletError(
      "This runtime has no Web Crypto. Pass crypto: { getRandomValues, sha256 } to createGrant (React Native: expo-crypto).",
      "no_crypto",
    );
  }
  return impl;
}

/** Uses the array the implementation returns, not the one passed in: a
 *  fill-and-return impl and a fresh-buffer impl both work, and one that
 *  returns nothing fails loudly instead of yielding an all-zero verifier. */
function randomB64url(byteLength: number, c: PkceCrypto): string {
  return base64url(c.getRandomValues(new Uint8Array(byteLength)));
}

/** RFC 7636 S256 challenge. The verifier is 43 base64url chars (32 bytes),
 *  inside the spec's 43–128 range; challenge = BASE64URL(SHA256(verifier)).
 *  `c` stands in for Web Crypto (PkceCrypto); with neither, no_crypto. */
export async function pkceChallenge(c?: PkceCrypto): Promise<{
  verifier: string;
  challenge: string;
  method: "S256";
}> {
  const impl = resolveCrypto(c);
  const verifier = randomB64url(32, impl);
  const digest = await impl.sha256(new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64url(new Uint8Array(digest)),
    method: "S256",
  };
}

/** Step 1 (transport-agnostic): create the grant request with PKCE params.
 *  No secret. Returns the grant URL plus the verifier+state to keep. */
export async function createGrant(
  opts: PublicConnectOptions,
): Promise<StartedGrant> {
  if (!opts.redirectUri) {
    throw new OutletError(
      "redirectUri is required for the public-client (PKCE) flow.",
      "redirect_uri_required",
    );
  }
  const impl = resolveCrypto(opts.crypto);
  const { verifier, challenge, method } = await pkceChallenge(impl);
  const state = randomB64url(16, impl);
  const r = await api<{ grant_request_id: string; grant_url: string }>(
    opts.baseUrl ?? DEFAULT_BASE_URL,
    "/grants",
    {
      method: "POST",
      body: JSON.stringify({
        app_id: opts.appId,
        providers: opts.providers,
        requested_cap_usd: opts.requestedCapUsd,
        redirect_uri: opts.redirectUri,
        code_challenge: challenge,
        code_challenge_method: method,
        state,
      }),
    },
  );
  return {
    grantRequestId: r.grant_request_id,
    grantUrl: r.grant_url,
    verifier,
    state,
  };
}

/** Step 2 (transport-agnostic): exchange the redirect code + verifier for the
 *  session. The code proves the user approved; the verifier proves this
 *  client started the flow. Authenticated by the proof, not a secret. */
export async function exchangeCode(opts: {
  grantRequestId: string;
  code: string;
  codeVerifier: string;
  baseUrl?: string;
}): Promise<PublicSession> {
  const r = await api<OutletSession & { refresh_token: string }>(
    opts.baseUrl ?? DEFAULT_BASE_URL,
    "/grants/token",
    {
      method: "POST",
      body: JSON.stringify({
        grant_request_id: opts.grantRequestId,
        code: opts.code,
        code_verifier: opts.codeVerifier,
      }),
    },
  );
  const { refresh_token, ...session } = r;
  return { ...session, refreshToken: refresh_token };
}

interface Txn {
  grantRequestId: string;
  verifier: string;
  state: string;
  baseUrl?: string;
}

function persist(txn: Txn): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(txn));
  }
}
function recall(): Txn | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(STORE_KEY);
  return raw ? (JSON.parse(raw) as Txn) : null;
}
function clear(): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(STORE_KEY);
}

/** Browser, step 1: start the flow and navigate to the grant screen. Stashes
 *  the PKCE transaction in sessionStorage so handleRedirect can finish it. */
export async function connectRedirect(
  opts: PublicConnectOptions,
): Promise<StartedGrant> {
  const grant = await createGrant(opts);
  persist({
    grantRequestId: grant.grantRequestId,
    verifier: grant.verifier,
    state: grant.state,
    baseUrl: opts.baseUrl,
  });
  if (typeof window !== "undefined") window.location.assign(grant.grantUrl);
  return grant;
}

/** Browser, step 2: call on your redirect_uri page. Reads ?code&state from
 *  the URL, verifies state, exchanges, and clears the stored transaction. */
export async function handleRedirect(
  opts: { url?: string } = {},
): Promise<PublicSession> {
  const href =
    opts.url ?? (typeof window !== "undefined" ? window.location.href : "");
  const params = new URL(href).searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const txn = recall();
  if (!txn) {
    throw new OutletError("No PKCE transaction in progress.", "no_pkce_txn");
  }
  if (!code) {
    throw new OutletError(
      "No authorization code in the redirect URL.",
      "no_code",
    );
  }
  if (!state || state !== txn.state) {
    throw new OutletError(
      "State mismatch — possible CSRF; aborting.",
      "state_mismatch",
    );
  }
  const session = await exchangeCode({
    grantRequestId: txn.grantRequestId,
    code,
    codeVerifier: txn.verifier,
    baseUrl: txn.baseUrl,
  });
  clear();
  return session;
}
