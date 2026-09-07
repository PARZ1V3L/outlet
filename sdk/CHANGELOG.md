# Changelog — @useoutlet/sdk

## 0.4.0 — 2026-09-04

- **PKCE on phones.** `createGrant()` / `pkceChallenge()` accept an
  optional `crypto: { getRandomValues, sha256 }` for runtimes without
  Web Crypto (React Native / Hermes: pass expo-crypto). Browsers and
  Node need nothing. Neither available → `OutletError` code `no_crypto`.
- **`vault_requires_billing` speaks to the developer.** When the vault's
  billing gate refuses a new connection (402, SPEC §6.2), the `OutletError`
  message now carries the checkout hint — "Add a payment method to enable
  vault mode for this app. Existing connections keep working." — instead of
  the generic status line. Code and status are unchanged. Users never see
  this: the gate only ever answers the app's own `connect()` call.

## 0.3.0 — 2026-08-22

One release carries both 2026 feature lines: the OpenAI-compatible-provider
work first shipped in the public repo (2026-06-15) and the public-client
PKCE era. npm has never served a 0.3.0.

- **Public-client PKCE grant flow** (SPEC §7.1, ADR 0005): apps with no
  backend — SPA, mobile, CLI — connect without an `app_secret`. New surface:
  `connectRedirect()` / `handleRedirect()` for browsers, `createGrant()` /
  `exchangeCode()` / `pkceChallenge()` for clients that manage the redirect
  themselves. Sessions carry a grant-scoped `refreshToken` that authorizes
  later `refresh()` / `status()` / `revoke()`.
- **Fix: `refresh()` surfaces the rotated refresh token.** Public-client
  refresh tokens rotate on every use (OAuth 2.1 §6.1); the SDK previously
  dropped the new token, stranding public clients after their first refresh.
  `refresh()` now returns `refreshToken` when the vault rotates — persist it
  before the next call.
- **`status()` reads the pure `/status` endpoint.** Polling status no longer
  re-delivers key material; `status()` now returns `GrantInfo` including
  `spendUsd` (the vault's last meter reading, up to ~5 minutes stale).
- **Direct mode works with any OpenAI-compatible provider** (first shipped
  in the public repo, 2026-06-15). Pass the user's key under that provider
  (e.g. `{ groq: key }`) and point the OpenAI SDK at its `baseURL`. OpenAI,
  Anthropic, and Google still get strict key-format and provider-mix-up
  validation; every other provider is accepted with the universal safety
  check (admin keys refused, empty keys rejected), since their key formats
  vary or are opaque.
- **Vault-mode calls fail gracefully when the vault is unreachable** (first
  shipped in the public repo, 2026-06-15): `connect` / `refresh` / `status`
  / `revoke` throw a clear `OutletError` with code `vault_unavailable` and a
  human door (email hello@useoutlet.dev), instead of a raw network error.
- Docs: `capUsd` is `Infinity` in direct mode and does not survive
  `JSON.stringify` (becomes `null`) — noted on the type. README now says
  "App key" for the provisioned key, matching the product glossary.

## 0.2.1 — 2026-06-12

- First public release: direct (paste) mode with local validation, vault-mode
  `connect()` / `refresh()` / `revoke()` / `status()` against the draft wire
  protocol.
