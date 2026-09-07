# ADR 0004: Docs — in-site pages under /docs on the existing Pages project

**Status:** Accepted (Parz, 2026-06-12; revised same day: no separate
subdomain or framework for now) · **Date:** 2026-06-12

## Context

Outlet needs real documentation with two audiences: end users (connecting
accounts, finding admin keys, with screenshots) and developers (SDK,
integration, spec). Content must be ours, versioned with the repo, branded,
and free to host. The admin-key guides are launch-blocking for the vault.

## Options

1. **Astro Starlight** on Pages — markdown in-repo, built-in sidebar/search/
   dark mode, fully themeable to the brand, static output.
2. VitePress on Pages — same idea, Vue-flavored, slightly less docs-focused.
3. GitBook hosted — fastest start, but content lives in their platform,
   free tier carries their branding. Rejected: docs are a brand surface.

## Decision

Hand-rolled branded HTML pages in `site/docs/`, shipped by the existing
Pages project at useoutlet.dev/docs. Parz's call: the live site IS the dev
site today; docs belong on it, not on a subdomain. Two sections on the docs
index: Users and Developers. No Astro/Starlight/GitBook until the page
count earns a framework (revisit when the main site splits into separate
user and dev faces; a docs subdomain is the industry norm at that point).
spec/SPEC.md stays the protocol source of truth; docs link to it.

## Consequences

- Zero new build tooling. Each page is self-contained HTML using the site's
  brand variables, deployed by the same `wrangler pages deploy site`.
- Screenshots for guides are captured by Parz (we don't fake dashboard
  images); pages ship with marked placeholder slots until then.
- Site copy rules apply: Parz approves wording, no em dashes, concrete and
  honest, user pages never use dev-facing jargon.
