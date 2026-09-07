# ADR 0003: Vault auth wall — hosted identity provider, JWT-verified in the Worker

**Status:** Accepted (Parz, 2026-06-12) — WorkOS AuthKit · **Date:** 2026-06-12

## Context

The vault cannot deploy or hold a real user credential until users can log in
(hard rule since day one). We are one person; rolling our own auth (passwords,
sessions, resets, MFA) is the highest-risk thing we could build. The vault is
a plain JSON API on Cloudflare Workers; whatever issues identity must let the
Worker verify a token statelessly (OIDC JWT via JWKS, WebCrypto, zero new
runtime deps).

## Options

1. **WorkOS AuthKit** — hosted login UI, free to 1,000,000 MAU, standard OIDC.
2. **Clerk** — hosted UI/components, fastest DX, free to 10,000 MAU then paid.
3. **Auth0** — most established, free tier shrank; heavier than we need.
4. Roll our own — rejected outright (one-person ops, credential custodian).

All three hosted options work identically from the Worker's side: verify the
session JWT against the provider's JWKS, extract the user id, attach it to
the request. The choice is price ceiling vs DX speed.

## Decision

**WorkOS AuthKit** — the 1M-MAU free tier means auth
cost stays zero through any plausible launch outcome, it's standards-plain
OIDC, and the hosted screen keeps password handling entirely off our plate.

Admin surfaces (anything operational that is not end-user facing) sit behind
**Cloudflare Access** regardless of this choice.

## Consequences

- vault gains `lib/jwt.ts` (JWKS fetch + RS256 verify via WebCrypto, no deps)
  and an auth middleware in `index.ts` wiring; every /v0 route except /health
  requires a verified user.
- The grant screen becomes a small static page (Pages) that logs in via the
  provider and calls the vault with the session token; the vault itself stays
  a UI-free JSON API.
- Parz owns one dashboard task: create the provider account and paste the
  issuer + client IDs into Workers secrets.
