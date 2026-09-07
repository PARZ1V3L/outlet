# ADR 0001: Credential encryption — direct AES-GCM in v0, envelope/KMS at GA

**Status:** Accepted (prototype scope) · **Date:** 2026-06-11

## Context

SPEC §6 calls for envelope encryption with KMS-wrapped data keys. The vault
runs on Cloudflare Workers, which has no KMS primitive. Credentials must
still be encrypted at rest in D1 from day one.

## Options

1. Direct AES-256-GCM with a master key in Workers secrets (current code).
2. Envelope encryption with data keys wrapped by an external KMS (AWS/GCP)
   — adds a cloud dependency and a network hop to every provision call.
3. No encryption until GA — unacceptable.

## Decision

Option 1 for the prototype: `lib/crypto.ts` encrypts each credential with
AES-256-GCM (fresh IV per encryption) under a single 32-byte master key held
in the Workers secret store, never in code or D1.

## Consequences

- Master-key rotation requires re-encrypting all rows (acceptable at
  prototype scale; write the rotation script before first external user).
- Before GA: revisit with real requirements — external KMS, or per-row data
  keys wrapped by the master key (envelope without KMS). SPEC §6 stays as
  the GA target; this ADR is the blessed v0 deviation.
