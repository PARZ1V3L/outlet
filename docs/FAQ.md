# Outlet — Founder FAQ

Plain-language answers to the questions that actually came up while building.
Written for humans first; the spec has the formal versions. Add to this every
time a question makes something click.

---

## Q1: If connecting is "just hooking up an admin key," why all these probes and tests? What do they mean?

When a user hooks up their admin key, they're handing Outlet the **master
key to their entire account**. Outlet's one promise — the entire reason it
deserves to exist — is: *"any app you plug in can never spend more than the
cap you set."* Every test we ran was checking whether that promise is
actually true, and whose job it is to keep it.

**The probes** checked what tools the power company actually gives us. The docs were vague,
so instead of guessing we asked the live APIs: can we create a small
sub-account per app? Mint a key for it? Set a spending limit? OpenAI said
yes to everything. Anthropic said "keys must be made by hand in our
console." Now the spec is built on facts, and we knew to build OpenAI first.

**The budget test** checked whether
OpenAI's "spending limit" setting is a real circuit breaker or just a
sticker on the panel. We installed a $1 fuse and deliberately ran current
through it. **The fuse never blew** — spend hit $1.37 and OpenAI never said
no. Huge finding: the provider's "cap" is a label, not a breaker, so **the
breaker has to be ours.** If we'd assumed instead of tested, the promise to
users would have been quietly false — discovered the day some user's runaway
app burned $400.

**The rate-limit layer** plugs the last gap in our breaker. Our meter reads
the spending dial every 5 minutes, but OpenAI's dial itself runs 10–20
minutes behind reality — a blind window where a buggy or malicious app could
burn fast before we notice. The fix: narrow the pipe at installation. A $5
grant gets a thin wire (~4 requests/minute), so even going full blast
through the whole blind window it can only burn a few dollars before our
breaker trips and kills the key.

**The short version:** connecting the key is easy — being *trusted* with it
is the hard part, and trust is built from exactly these boring, paranoid
checks. "The cap actually works; we tested it with real money" is the
sentence that makes Outlet a vault instead of a paste-your-key form.

---

## Q2: I had to load money into a new "organization" to test. Can't we use the subscription people already pay for? Doesn't this defeat "use the power you already have"?

**Every provider runs two separate wallets, and they don't connect — by
design.** Your Claude Max or ChatGPT Plus subscription is wallet one: flat
monthly fee, usable only inside *their* apps. The API organization is wallet
two: pay-as-you-go, usable by code. There is no pipe between them. An admin
key can only ever spend wallet two. This isn't a limitation we can engineer
around — providers built that wall deliberately, because subscriptions are
priced assuming human-speed usage, and letting code drain them would break
their economics. Anyone who wires around it gets banned (the OpenClaw
story). SPEC §2.1 walls this off formally.

**But the subscription door is opening anyway — on the providers' terms:**

- **Anthropic, 2026-06-15:** every plan gains an "Agent SDK credit"
  ($20 Pro → $200 Max 20x) explicitly for third-party apps. A Max plan now
  includes subscription power apps can legally tap.
- **OpenAI:** "Sign in with ChatGPT" — app usage runs on the user's own plan.

Outlet can't mint keys from subscriptions, but it can be the **one button
that wraps both doors**: API account → we provision a capped key
(built, demonstrated); subscription → we route through the provider's
sanctioned port (research item 1b, opens June 15). The user just sees
"Connect your AI."

**Reframe on "the power you already have":** the API wallet is the prepaid
power meter. Today only developers have one — but the long-term vision says
everyone will pay an AI power bill, and that bill *is* this wallet. A normal
person putting $10 in an OpenAI wallet today has no safe way to use it
across apps. That's exactly what the vault makes possible. Outlet doesn't
create the two-wallet world — it makes both wallets pluggable.

---

## Live-fire lessons (for the engineering log)

Things real runs caught that stubs and docs never would have:

- **D1 read-after-write race** — fresh writes can briefly read stale; retry.
- **OpenAI project creation is eventually consistent** — calls against a
  just-created project can 404 for seconds; retry404 everywhere.
- **Budget `budget_limit_usd` is advisory** — $1.37 spent against a $1
  budget, zero rejections (310 calls, 2026-06-11).
- **Costs API lags 10–20 min** — the metering blind window; bounded by
  provision-time rate limits.
- **Some rate-limit entries can't be configured** (preview models return
  `rate_limit_does_not_exist`) — tighten what you can, never die on what
  you can't.
- **gpt-5-family models spend completion tokens on internal reasoning** —
  a small `max_completion_tokens` returns HTTP 200 with *empty content*.
  Budget ≥2000 tokens and treat empty content as a failure, not success.
- **Provisioned resources appear in the user's own console** — name them
  with the app's display name, not an opaque id.
- **Multi-provider users WILL paste the wrong admin key** (founder did it
  first: Anthropic key into the OpenAI field — read as a frozen UI). Label
  fields with provider + expected prefix, validate client-side AND
  server-side, and make every rejection name the fix, not just the failure.
