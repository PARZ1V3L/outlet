# ADR 0002: Open spec + SDK, private vault, app registry as the gate

**Status:** Accepted · **Date:** 2026-06-11 · **Decided:** Parz + dev (QA)

## Context

The original plan open-sourced everything including the vault ("trust via
transparency"). The 2026-06-11 planning meeting set a different posture:
Outlet should become *the authority* on AI key management, with a vetted
directory of Outlet-enabled apps as the adoption flywheel and future
consumer surface ("where can I use my key?"). That requires the network —
not the code — to be the moat.

## Decision

1. **Repo split.** Public repo `outlet`: `sdk/`, `spec/`, `docs/`, `site/`.
   Private repo `outlet-vault`: `vault/`, `tools/` (probes), deploy config.
2. **Open spec, private vault** (Plaid model). The protocol is public and
   anyone may implement it; our vault implementation, infra, and operations
   are closed. SPEC §6's "self-hostable OSS vault" promise is replaced.
3. **App registry is the gate.** Apps register with Outlet, receive
   `app_id` + `app_secret`, and the vault rejects requests from unregistered
   apps. Cloning the SDK grants nothing: the SDK is a thin client; the value
   is registry membership + the hosted vault behind it.
4. **Directory + promotion as the carrot.** Registered apps that pass a
   basic audit get listed in the public directory and promoted (homepage,
   SDK marketing). Audit criteria start simple and tighten over time.
5. **Pricing posture:** free for developers until the vault is launched and
   proven; per-connected-account fees later. Always free for end users.

## Why

- A solo/2-person team can't out-feature incumbents; it can out-curate them.
  The directory turns every adopter into marketing.
- Closed vault keeps the security-critical surface small and avoids
  supporting self-hosters before there's revenue.
- Open spec keeps the standards play and credibility from the original plan.

## Consequences / costs

- The "audit our code" trust argument is gone. Replacements: open spec,
  public security docs, third-party security review before GA, SOC 2 roadmap.
- MVP scope grows by: `apps` table, app auth middleware, registration flow,
  and (later) the directory page. Kept deliberately minimal in v0.
- If the registry stays empty, the gate has no value — directory recruitment
  becomes a launch-critical task, not an afterthought.
