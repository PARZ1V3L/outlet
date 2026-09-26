# Changelog (@useoutlet/sdk)

## 0.6.3 (2026-09-26)

### Added

- `ConnectionEndedError`, one typed error for a connection that ends. `status()` and `refresh()` throw it when the user's Vault connection is paused at its cap, revoked or disconnected, or when its refresh token is gone. `reason` says which: `capped`, `revoked` or `expired`. `grantId` says which connection.
- `wrapFetch()`, optional. Hand the provider's SDK the wrapped fetch. A provider answer of 401, 402, 403 or 429 becomes one `status()` check. An open connection gets the provider's answer back untouched. On a Direct session, a 401 is the provider refusing the Direct API key: the same error, with reason `refused`.
- The Connect your AI button hears about the end and shows one screen with the one thing the user can do: Raise the Vault cap, Connect again, or Paste a new Direct API key. `onSession` receives the new session.
- CI runs the README's quickstart as printed, in the runner's Chrome.
- The Python SDK's first release, `useoutlet` 0.1.0, as a separate package. `pip install useoutlet` gives a Python server the same Vault calls: connect, wait, exchange, refresh, status and revoke, and `direct()`.

### Fixed

- `connect()` sends the app secret on every poll of the connection request. A confidential app's poll answered 401 before.
- The `state_mismatch` message reads "State mismatch. Possible CSRF; aborting." in both packages. It carried an em dash.

### Changed

- `status()` on a capped or revoked Vault connection throws `ConnectionEndedError` instead of returning the `GrantInfo`. The vault's answer is on the error's `info`.
- `refresh()` on a connection that ended throws `ConnectionEndedError`, code `connection_ended`, where it threw an `OutletError` with code `grant_capped`, `grant_revoked` or `unauthorized`.

0.6.2: the Connect your AI button as a React hook and a Vue composable (@useoutlet/sdk/react, @useoutlet/sdk/vue), with an example of each. npx @useoutlet/sdk mcp, a dependency-free MCP docs server that serves the docs and the setup prompt and speaks both the 2026-07-28 revision and the initialize handshake. The Claude Code plugin and the Cursor rule under ai-tools/. The Direct paste screen can say where the app keeps the user's Direct API key. The docs server finishes its reply when a client closes the pipe early.

0.6.1: OpenRouter joins OpenAI, Anthropic and fal in Vault: the Connect your AI button offers its Vault door with OpenRouter's own words, and `providerIds("vault")` and `providers.json` say so. The README's AI prompt names `providers`. The spec gains the cap edit and its resume, the approve claim, the meter's fresh read, and the audit actions that go with them.

0.6.0: a provider registry of nineteen, each with a named Direct screen in the Connect your AI button. Any other provider gets the generic Direct screen from the name and keys page your app supplies. fal joins OpenAI and Anthropic in Vault. The button shows `google` as Gemini. `providers`, `getProvider()` and `providerIds()` ship in the package, with the same data as `@useoutlet/sdk/providers.json`. `direct()` still takes any provider's key whole and refuses what it refused before. `GrantInfo` gains `reason`. The README gains media apps, background jobs and several providers, and the spec the rows that go with them.

0.5.2: Direct API key and Vault admin key wording in the Connect your AI button, and the README and spec lines that go with it.

0.5.1: provider key names in Direct guides, shared modal layout with visible actions, and draft-preserving Direct back navigation.

## 0.5.0

### Added

- `@useoutlet/sdk/ui` with `mountConnectButton()` for Direct and Vault.
- Provider guides, Direct API key format checks, and connected states.

### Changed

- Build and test the package before the publishing job.
- Document refresh-token rotation.

## 0.4.1 (2026-09-07)

- README wording pass.
- The npm page links the source: github.com/PARZ1V3L/outlet.
- Published from GitHub Actions with provenance.
- Dev dependency: vitest 3.x.

## 0.4.0 (2026-09-04)

- **PKCE on phones.** `createGrant()` / `pkceChallenge()` accept an
  optional `crypto: { getRandomValues, sha256 }` for runtimes without
  Web Crypto (React Native / Hermes: pass expo-crypto). Browsers and
  Node need nothing. Neither available → `OutletError` code `no_crypto`.
- **`vault_requires_billing` speaks to the developer.** When the vault's
  billing gate refuses a new connection (402, SPEC §6.2), the `OutletError`
  message now carries the checkout hint ("Add a payment method to enable
  vault mode for this app. Existing connections keep working.") instead of
  the generic status line. Code and status are unchanged. Users never see
  this: the gate only ever answers the app's own `connect()` call.

## 0.3.0 (2026-08-22)

One release carries both 2026 feature lines: the OpenAI-compatible-provider
work first shipped in the public repo (2026-06-15) and the public-client
PKCE era. npm has never served a 0.3.0.

- **Public-client PKCE grant flow** (SPEC §7.1, ADR 0005): apps with no
  backend (SPA, mobile, CLI) connect without an `app_secret`. New surface:
  `connectRedirect()` / `handleRedirect()` for browsers, `createGrant()` /
  `exchangeCode()` / `pkceChallenge()` for clients that manage the redirect
  themselves. Sessions carry a grant-scoped `refreshToken` that authorizes
  later `refresh()` / `status()` / `revoke()`.
- **Fix: `refresh()` surfaces the rotated refresh token.** Public-client
  refresh tokens rotate on every use (OAuth 2.1 §6.1); the SDK previously
  dropped the new token, stranding public clients after their first refresh.
  `refresh()` now returns `refreshToken` when the vault rotates. Persist it
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
  `JSON.stringify` (becomes `null`), noted on the type. README now says
  "App key" for the provisioned key, matching the product glossary.

## 0.2.1 (2026-06-12)

- First public release: direct (paste) mode with local validation, vault-mode
  `connect()` / `refresh()` / `revoke()` / `status()` against the draft wire
  protocol.
