# ADR 0006: Grant-screen sign-in — first-party token broker

**Status:** Accepted (design settled 2026-08-14; wording and production
cutover remain Parz's) · **Date:** 2026-08-14

## Context

The grant screen authenticates users against WorkOS AuthKit (ADR 0003) and
today does it with `@workos-inc/authkit-js` in `devMode: true` — which parks
the WorkOS **refresh token in `localStorage`**. Acceptable while staging runs
throwaway accounts; not acceptable for production accounts whose session can
drive the credential-holding writes the human gate protects (SPEC §6.3). The
`grant.js` header has promised "production replaces devMode with the
token-broker flow" since 2026-07-30; no design existed until this ADR.

Two further constraints shape the design:

- **The vault has zero ambient authority.** CORS is `origin: "*"` precisely
  because no cookie, ever, carries authority (index.ts ruling, security
  review 2026-07-03). Any cookie-based session design would overturn that.
- **Cutover must be constants-only.** At go-live the screen should need a
  vault URL and a Turnstile sitekey — nothing else (PROD-DEPLOY checklist).

There is also a supply-chain smell worth deleting: `authkit-js` arrives from
`esm.sh` — a third-party CDN script running on the page where users paste
admin keys.

## Options

1. **Keep authkit-js, add a custom AuthKit auth domain** (`auth.useoutlet.dev`
   CNAME) so its cookie is first-party to WorkOS's hosted domain. Rejected:
   adds a DNS + WorkOS-feature dependency to CP2, keeps the CDN script on the
   credential page, and leaves session mechanics inside a third-party lib we
   don't control.
2. **Ship devMode to production.** A persistent, `localStorage`-exfiltratable,
   WorkOS-session-wide refresh token on the credential page. Rejected — the
   code comment has said so from day one.
3. **Stateless broker** — vault returns the WorkOS refresh token encrypted
   under `MASTER_KEY`; the page stores the blob and presents it to refresh.
   No server state, but also no revocation, no rotation-theft detection, no
   server-side TTL. Rejected.
4. **D1-backed token broker (chosen).** The vault — already the OIDC verifier
   — brokers the code exchange and holds the WorkOS refresh token encrypted
   at rest. The browser holds only a short-lived access token (memory) and a
   rotating opaque broker token (`sessionStorage`).

## Decision

Three grant-screen-internal routes (like `/consent`, they are not SDK
surface):

1. `GET /v0/auth/start?redirect_uri&state&code_challenge&screen_hint` →
   **302** to the AuthKit authorize URL. The vault contributes `client_id`
   and derives the endpoint from `AUTH_ISSUER`'s origin, so the page carries
   no WorkOS constants. The redirect-URI allowlist authority is **WorkOS's
   registered-URI list** (the same registry-gate pattern as ADR 0005): the
   vault forwards the parameter, WorkOS refuses unregistered values, so codes
   only ever land on our pages.
2. `POST /v0/auth/exchange { code, code_verifier }` → vault performs the
   public-client PKCE exchange against WorkOS (the same call authkit-js makes
   from the browser, moved server-side; no client secret exists or is
   needed) → writes an `auth_sessions` row `{ token_hash, encrypted_refresh
   (AES-GCM under MASTER_KEY), auth_sub, created_at, expires_at }` → returns
   `{ access_token, broker_token }`. The WorkOS refresh token never reaches
   the browser.
3. `POST /v0/auth/refresh` (`Authorization: Bearer as_…`) → **conditional
   consume** of the session row (`DELETE … WHERE token_hash = ?`,
   `meta.changes === 1` — the auth-code-burn lesson: N racers, exactly one
   winner) → WorkOS refresh (which rotates its token too) → new row, new
   broker token → `{ access_token, broker_token }`. Stale, replayed, raced,
   or expired tokens all get the same `401 unauthorized` — no oracle.

PKCE for this leg is page-side: the page generates the verifier, sends the
challenge through `/start`, and spends the verifier at `/exchange`. `state`
round-trips through WorkOS and is checked by the page (CSRF).

Boundaries:

- **requireUser is untouched.** Brokered access tokens are ordinary AuthKit
  RS256 JWTs verified via JWKS (ADR 0003). The broker adds a way to *obtain*
  tokens, not a new way to *use* them.
- **Not Turnstile-gated** (SPEC §6.3): sign-in precedes the widget, and the
  authorization code is single-use and WorkOS-issued. `RL_WRITE` covers the
  POSTs; `RL_DEFAULT` covers `/start`.
- **No audit rows.** `audit_log` stays credential/grant-scoped; identity
  events live at the issuer.
- **Sessions are short.** Absolute TTL 12 hours from the original sign-in —
  rotation carries the sign-in time through, so refreshing never extends it —
  longer than any grant flow, shorter than WorkOS's session; expired rows are
  swept opportunistically on exchanges. WorkOS stays authoritative: if its
  refresh fails, the session is dead regardless.
- **Sign-out is deferred.** The screen has no sign-out affordance; sessions
  are per-tab and TTL-bound. Revisit with the dashboard.

Page behavior (`site/grant/auth.js`): access token in memory only, renewed
single-flight ~30 s before expiry; broker token in `sessionStorage` (per-tab,
gone on close). A reload resumes with one `/refresh`; a new tab or an expired
session shows the sign-in button, which WorkOS's own hosted session usually
turns into a silent bounce.

## Security posture

- Zero ambient authority preserved: no cookies anywhere; the CORS `"*"`
  ruling stands unamended.
- XSS blast radius shrinks: devMode exposed a persistent refresh token usable
  directly against WorkOS; the broker token is opaque, single-use-rotating,
  usable only against the vault, revocable server-side (delete the row), and
  theft is *detectable* — a stolen token's use signs the losing holder out
  instead of silently coexisting, and the vault logs the raced consume for
  the operator.
- The `esm.sh` dependency is deleted; the credential page runs first-party
  script plus Cloudflare's Turnstile `api.js` only.

## Consequences

- **vault** gains `auth_sessions` (new table, no ALTERs), `routes/auth.ts`,
  `lib/authkit.ts` (upstream calls, injectable fetcher) and
  `lib/auth-sessions.ts` (session store). Zero new bindings: `AUTH_ISSUER` /
  `AUTH_JWKS_URL` / `AUTH_CLIENT_ID` already exist per environment.
- **site** gains `grant/auth.js`; `grant.js` drops the authkit-js import,
  `devMode`, and the `CLIENT_ID` constant. Production cutover becomes two
  constants — vault URL + sitekey — recorded in the deploy notes.
- **SPEC** is silent on these internal routes by design; if the dashboard
  later reuses the broker, that's when it earns spec text (tracked in
  the working notes, not drafted here).
