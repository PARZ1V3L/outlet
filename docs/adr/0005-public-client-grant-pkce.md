# ADR 0005: Public-client grant path — PKCE, no app secret

**Status:** Accepted (Parz, 2026-06-14) · **Date:** 2026-06-14

## Context

SPEC §7 promises "PKCE for public clients," but §6.1 makes the confidential
`app_secret` mandatory for grant creation *and every other grant operation*.
Those two statements contradict. A public client — browser SPA, mobile app,
CLI — cannot hold a secret, so under §6.1 as written it cannot create a grant
at all; the "PKCE for public clients" line had no flow behind it. A developer
with no backend was left with only `direct()` (user pastes their own uncapped
key); the capped, revocable vault path was effectively backend-only.

That blocks the consumer wedge: the apps most likely to want "connect your AI
account" are exactly the small, frontend-only ones.

## Options

1. **Secret-only, drop the public-client promise.** Honest, but concedes the
   whole frontend-app market to `direct()` (no caps, no revocation). Rejected.
2. **Backend proxy required.** Tell public apps to stand up a thin secret
   holder (the demo's `server.mjs`). Works, but "you must run a server" is the
   exact friction we are trying to delete. Rejected as the default.
3. **PKCE public clients (chosen).** Standard OAuth 2.1 public-client posture:
   no secret, grant creation bound by PKCE + a registered redirect-URI
   allowlist, later operations bound by a grant-scoped refresh token.

## Decision

Registration issues a **client type**:

- **Confidential client** — has a backend. Gets `app_id` + `app_secret`.
  Authenticates every grant operation with the secret. (Unchanged.)
- **Public client** — no backend. Gets `app_id` + one or more exact-match
  **registered redirect URIs**; **no secret is issued**. Authenticates grant
  *creation* with PKCE (RFC 7636, `S256`) and later operations with a
  rotating, grant-scoped refresh token.

An app may register both.

Public-client grant flow:

1. SDK generates `code_verifier`, `code_challenge = S256(code_verifier)`, and
   `state`; opens the grant screen with `app_id`, `code_challenge`,
   `redirect_uri`, `state`.
2. User logs in (WorkOS, ADR 0003) and approves app + cap.
3. Vault provisions the scoped keys, then redirects to the **registered**
   `redirect_uri` with `?code=…&state=…`. **Keys are never in the redirect**
   — URLs leak via history, referrer, and logs.
4. SDK verifies `state`, then exchanges over the back channel:
   `POST /grants/token { grant_request_id, code, code_verifier }` →
   `{ ...OutletSession, refresh_token }`. The vault checks
   `S256(code_verifier)` against the stored `code_challenge`.
5. `refresh` / `status` / `revoke` present the grant-scoped `refresh_token` as
   a Bearer credential instead of the secret. `refresh` **rotates** it
   (OAuth 2.1 §6.1): the response carries a new token and the presented one is
   voided.

## Registry gate without a secret

The secret is what stops SDK forks from using our vault (§6.1, ADR 0002). For
public clients the equivalent gate is the **exact-match redirect-URI
allowlist**: the vault only ever redirects authorization codes to URIs the
real app pre-registered, and a code is useless without the matching verifier.
Copying a public `app_id` gets a fork nothing — it cannot register a redirect
URI under someone else's `app_id`, so codes never reach it, and the grant
screen still shows the genuine app's identity to the approving user.

## Least privilege

A public client never holds an app-wide credential. It holds only per-grant
tokens: a scoped, capped, revocable provider key and a grant-scoped refresh
token (one app, one user, one cap). Blast radius of a leak is one grant, and
the user can revoke it from the dashboard regardless.

## Consequences

- **vault** gains: a redirect-URI allowlist in the app registry; a
  `POST /grants/token` exchange endpoint; PKCE challenge storage per grant
  request; grant-scoped refresh tokens with mandatory rotation; Bearer auth on
  the public-client `refresh`/`status`/`revoke` paths.
- **SDK** gains a real PKCE implementation behind the existing `redirectUri`
  option (WebCrypto `S256`, `state` check, code exchange) and a public-client
  `refresh()` that carries the refresh token instead of `appSecret`. Tracked
  as follow-up — this ADR specs the wire protocol first.
- **Confidential path is untouched** — existing apps keep using `app_secret`.
- The unauthenticated `GET /grants/{id}` poll in the v0 SDK skeleton is
  superseded for public clients by the bound code exchange; flagged for
  confidential-side cleanup separately.

## Addendum 2026-09-04: phones

- A registered `redirect_uri` may be a private-use reverse-DNS scheme (RFC
  8252 §7.1), such as `com.example.app:/outlet`, alongside `https` and
  loopback `http`: matched exactly as written, no fragment, 512 characters at
  most (vault 6780b84). Native apps open `grant_url` in the system auth sheet
  (`ASWebAuthenticationSession`, Chrome's Auth Tab), never an embedded web
  view; PKCE is the mitigation for scheme interception (RFC 8252 §8.1).
- The SDK's `createGrant()` accepts an optional `crypto: { getRandomValues,
  sha256 }` (`pkceChallenge()` takes the same object as its one argument) for
  runtimes without Web Crypto (React Native / Hermes: expo-crypto); with
  neither available they throw `OutletError` code `no_crypto` (sdk c03976d).
