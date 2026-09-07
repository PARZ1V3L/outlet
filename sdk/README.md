<p align="center">
  <a href="https://useoutlet.dev"><img src="https://useoutlet.dev/og.png" alt="outlet: use the AI power you already pay for" width="640"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@useoutlet/sdk"><img src="https://img.shields.io/npm/v/%40useoutlet%2Fsdk?labelColor=18181A&color=D6F436" alt="npm version"></a>
  <img src="https://img.shields.io/badge/dependencies-0-D6F436?labelColor=18181A" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-D6F436?labelColor=18181A" alt="TypeScript types included">
  <img src="https://img.shields.io/badge/license-MIT-D6F436?labelColor=18181A" alt="MIT license">
</p>

# @useoutlet/sdk

**Let your users plug in the AI they already pay for.**

Outlet connects a user's existing AI account (Anthropic, OpenAI, Google, or
any OpenAI-compatible provider) to your app through **App keys —
spend-capped, revocable, one per app** — never their raw credentials. Your
app calls the provider directly with the official SDK; Outlet is **never in
the data path**.

> Status: **direct mode works today** (validated bring-your-own-key, no
> server). Vault mode (capped, revocable App keys) is in early access —
> email hello@useoutlet.dev to register your app: same session shape,
> one-line upgrade. Protocol docs at [useoutlet.dev](https://useoutlet.dev).
> Feedback welcome.

## Why

- Users already pay for AI. They shouldn't pay again inside every app.
- Developers shouldn't store customer API keys (breach target, compliance).
- Raw keys are all-or-nothing. Outlet keys are per-app, capped, revocable.

## Install

```sh
npm install @useoutlet/sdk
```

## Usage today (direct mode)

Your user pastes their own API key; the SDK validates it locally (catches
provider mix-ups, **refuses admin keys**) and hands back a session. No
network, nothing sent to Outlet — a local format check.

```ts
import Outlet from "@useoutlet/sdk";

const session = await Outlet.direct({
  keys: { openai: userPastedKey },
});

import OpenAI from "openai";
const ai = new OpenAI({ apiKey: session.keys.openai });
```

Works with **any OpenAI-compatible provider** — pass the key under that
provider and point the OpenAI SDK at its base URL:

```ts
const session = await Outlet.direct({ keys: { groq: userPastedKey } });

const ai = new OpenAI({
  apiKey: session.keys.groq,
  baseURL: "https://api.groq.com/openai/v1",
});
```

OpenAI, Anthropic, and Google get strict key-format checks (mix-ups caught,
admin keys refused); other providers are accepted with the same admin-key
safety check, since their key formats vary.

## Vault mode (one-line upgrade, in early access)

Same session shape. The connect box becomes a [ Connect your AI ] button,
and the pasted key becomes an App key: provisioned inside the user's own
account for exactly your app, spend-capped, and revocable.

```ts
// NOTE: vault mode is in early access. Email hello@useoutlet.dev to register your app and get an app_id.
//
// 1. user clicks [ Connect your AI ], which opens the Outlet grant screen
const session = await Outlet.connect({
  appId: "app_yourapp",
  providers: ["anthropic", "openai"],
  requestedCapUsd: 10,
});

// 2. same as before
const ai = new OpenAI({ apiKey: session.keys.openai });

// later: re-fetch keys (session.grantId is the thing you persist)
const fresh = await Outlet.refresh(session.grantId);

// check spend / status
const info = await Outlet.status(session.grantId);
console.log(`${info.spendUsd} of ${info.capUsd} used`);
```

### No backend? Public clients use PKCE

`connect()` suits apps with a server (it can hold an `appSecret`). A pure
frontend — SPA, mobile, CLI — registers as a **public client** instead: no
secret, just a registered `redirectUri`. Grant creation is secured by PKCE
(protocol docs at [useoutlet.dev](https://useoutlet.dev)), so the flow
spans the redirect in two calls:

```ts
// on your [ Connect your AI ] button — generates PKCE, redirects to the grant screen
await Outlet.connectRedirect({
  appId: "app_yourapp",
  providers: ["anthropic"],
  redirectUri: "https://yourapp.com/outlet/callback",
});

// on the page served at redirectUri — verifies state, exchanges the code
const session = await Outlet.handleRedirect();
const ai = new Anthropic({ apiKey: session.keys.anthropic });

// session.refreshToken (not an app secret) authorizes later calls:
await Outlet.refresh(session.grantId, { refreshToken: session.refreshToken });
```

The provider key arrives only on the back-channel exchange — never in the
redirect URL — and the `refreshToken` is scoped to this one grant.

## Phones

The public-client flow works inside iPhone and Android apps. Open the
grant URL in the system browser sheet, take the code back on your
registered return address (a private scheme like com.yourapp:/outlet,
or your website), then call `exchangeCode()`. React Native has no Web
Crypto: pass `crypto: { getRandomValues, sha256 }` from expo-crypto to
`createGrant()`. Guide: https://useoutlet.dev/docs/dev/mobile

## What your app never sees (vault mode)

- The user's root API key or account credentials
- Other apps' keys or spend
- Anything after revocation — a revoked grant simply stops working

Direct mode is the honest bridge while vault mode is in early access: the
user's own key, in your app, by their explicit choice, but validated, never
an admin credential, and on the same API you'll keep when you upgrade to
vault mode.

## What Outlet never does

No proxying. No token markup. No model routing. No prompt storage.
Free for end users, forever. Direct mode is free; the vault is the paid
product for developers. MIT licensed.

---

Docs: [useoutlet.dev](https://useoutlet.dev) · [Source](https://github.com/PARZ1V3L/outlet) · Contact: hello@useoutlet.dev
