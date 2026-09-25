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
any OpenAI-compatible provider) to your app through **capped, revocable App
keys, one per app.** Never their raw credentials. Your app calls the provider
directly with the official SDK. Outlet is **never in the data path**.

> Status: **direct mode works today** (validated bring-your-own-key, no
> server). Vault mode (capped, revocable App keys) is open.
> Register your app at useoutlet.dev/register.
> The same session in both modes. Protocol docs at [useoutlet.dev](https://useoutlet.dev).
> Feedback welcome.

## Building with an AI? Paste this into your AI.

Your AI adds the Connect your AI button for you. The same button can offer
Direct, Vault or both. Register your app at useoutlet.dev/register for the app ID.

```text
Add Outlet to this app so users can connect their own AI account.
Read https://useoutlet.dev/llms-full.txt first.
Install: npm install @useoutlet/sdk
App ID: <from useoutlet.dev/register>
Return address: <the https or private-scheme return address>
Local testing: http://localhost/outlet/return, any port
Button: import { mountConnectButton } from "@useoutlet/sdk/ui".
Mount on an empty div with mode: "both", providers, appId and redirectUri.
Vault return: pass Outlet.handleRedirect() as session only when the return address has code and state.
Receive the Direct or Vault session through onSession.
No app secret in the app.
Vault provider: choose openai, anthropic, fal or openrouter. Use a separate Vault connection request for each provider.
Place the Connect your AI button where users connect their AI account.
After connect: call the provider with its official SDK using session.keys.<provider>.
```

## Why

- Users already pay for AI. They shouldn't pay again inside every app.
- Developers shouldn't store customer API keys (breach target, compliance).
- Raw keys are all-or-nothing. Outlet keys are per-app, capped, revocable.

## Install

```sh
npm install @useoutlet/sdk
```

No build step? Import the button from a CDN:

```js
import { mountConnectButton } from "https://esm.sh/@useoutlet/sdk/ui";
```

## Usage today (direct mode)

Your user pastes their own API key; the SDK validates it locally (catches
provider mix-ups, **refuses admin keys**) and hands back a session. No
network, nothing sent to Outlet. A local format check.

```ts
import Outlet from "@useoutlet/sdk";

const session = await Outlet.direct({
  keys: { openai: userPastedKey },
});

import OpenAI from "openai";
const ai = new OpenAI({ apiKey: session.keys.openai });
```

Works with **any OpenAI-compatible provider**. Pass the key under that
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

## React and Vue

The button comes as a React hook and a Vue composable.

```ts
import { useConnectButton } from "@useoutlet/sdk/react";
import { useConnectButton } from "@useoutlet/sdk/vue";
```

Both take the same options as mountConnectButton and clean up on unmount.

```tsx
import { useConnectButton } from "@useoutlet/sdk/react";

function Connect() {
  const { ref } = useConnectButton({
    mode: "both",
    providers: ["openai"],
    appId: "app_yourapp",
    redirectUri: "https://yourapp.com/outlet/return",
    onSession: (session) => { ai = new OpenAI({ apiKey: session.keys.openai }); },
  });
  return <div ref={ref} />;
}
// In Next.js, mount the button in a client component.
```

```vue
<script setup lang="ts">
import { useConnectButton } from "@useoutlet/sdk/vue";

const { target } = useConnectButton({
  mode: "both",
  providers: ["openai"],
  appId: "app_yourapp",
  redirectUri: "https://yourapp.com/outlet/return",
  onSession: (session) => { ai = new OpenAI({ apiKey: session.keys.openai }); },
});
</script>

<template>
  <div ref="target"></div>
</template>
```

## Vault mode (the same session)

Same session shape. The pasted key becomes an App key: provisioned inside the
user's own account for your app alone, capped, and revocable.

```ts
// NOTE: register your app at useoutlet.dev/register to get your app_id.
//
// 1. user clicks [ Connect your AI ], which opens the Outlet grant screen
const session = await Outlet.connect({
  appId: "app_yourapp",
  providers: ["openai"],
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
frontend (SPA, phone app, CLI) registers as a **public client** instead: no
secret, just a registered `redirectUri`. Grant creation is secured by PKCE
(protocol docs at [useoutlet.dev](https://useoutlet.dev)), so the flow spans
the redirect in two calls:

```ts
// on your [ Connect your AI ] button: generates PKCE, redirects to the grant screen
await Outlet.connectRedirect({
  appId: "app_yourapp",
  providers: ["anthropic"],
  redirectUri: "https://yourapp.com/outlet/return",
});

// on the page served at redirectUri: verifies state, exchanges the code
const session = await Outlet.handleRedirect();
const ai = new Anthropic({ apiKey: session.keys.anthropic });

// session.refreshToken (not an app secret) authorizes later calls.
const fresh = await Outlet.refresh(session.grantId, { refreshToken: session.refreshToken });
// fresh.refreshToken replaces the one you sent; the old one now gets 401. Store the new one.
```

The provider key arrives only on the back-channel exchange, never in the
redirect URL. The `refreshToken` belongs to this one grant.

Outlet registers `http://localhost/outlet/return` for every app. It matches
any port.

## Phones

The public-client flow works inside iPhone and Android apps. Open the
grant URL in the system browser sheet, take the code back on your
registered return address (a private scheme like com.yourapp:/outlet/return,
or your website), then call `exchangeCode()`. React Native has no Web
Crypto: pass `crypto: { getRandomValues, sha256 }` from expo-crypto to
`createGrant()`. Guide: https://useoutlet.dev/docs/dev/mobile

## Media apps

Choose the provider that serves the models your app needs. The provider and
model determine which images, video or voice your app can make.

**Model hosts**

fal serves models from other makers for image, video and voice apps. Use an
API-scope fal Direct API key for Direct. For Vault, the user adds an
ADMIN-scope fal Vault admin key on useoutlet.dev. Your app receives a
separate Vault App key.

Replicate serves models from other makers. Use a Replicate API token as a
Direct API key. Replicate is Direct only because it does not provide an API
for Outlet to create separate Vault App keys.

**Model makers**

OpenAI’s gpt-image-2 and gpt-image-2.5 image models run through the existing
OpenAI Vault connection. Anthropic can provide text alongside media through
Direct or Vault. Google’s Gemini API is Direct only. Veo uses a long-running
operation; submitting a request does not mean the result is ready.

Other providers can use the generic Direct screen. Your app supplies the
provider’s name and official page for getting a Direct API key. Implement and
check that provider’s model calls in your app.

```ts
mountConnectButton(target, {
  mode: "direct",
  providers: ["fal", "replicate", { id: "runway", name: "Runway", keysUrl: "https://dev.runwayml.com/" }],
  onSession,
});
```

**Vault caps for media**

fal does not enforce a spending limit on each Vault App key. Outlet measures
the Vault App key’s spending from delayed fal reports. Outlet deletes the
Vault App key when reported spending reaches the Vault cap. Spending can
exceed the Vault cap, especially when jobs are costly or already running.
Revoking Vault access may not stop work the provider has accepted.

## Background jobs and workers

Use Vault for work your app must manage after the browser closes. Keep the
Vault connection and its refresh credentials in protected server storage,
associated with the user, app and provider. Your worker loads that connection
to obtain the app’s Vault App key. The app never receives the Vault admin key.

Refresh the Vault connection before access expires. Save the refreshed
connection before the next job uses it. Check Vault access before submitting
more work.

On a 401 response, stop submitting jobs and check whether the failure came
from Outlet or the provider. If the Vault connection has expired, refresh it.
If refresh fails or access is no longer active, ask the user to reconnect
through Outlet. Do not repeatedly retry a rejected Vault App key or resubmit
a generation whose outcome is unknown.

If Vault access is paused, stop new work and show that the connection needs
attention on Outlet. If Vault access is revoked, require the user’s approval
before reconnecting. If the Vault cap is reached, stop new work and show that
the Vault cap has been reached. Do not create another Vault connection to
bypass the Vault cap.

For fal, submit long jobs to its queue. Save the request ID with the job so
the worker can check that request instead of submitting it again. Use polling
or fal webhooks to collect the result. Verify webhook signatures and handle
repeated deliveries without processing the result twice.

When Vault access stops, stop local retries and further submissions. Request
cancellation of pending provider work where available. Cancellation may fail
to stop work already processing, so a job can still finish and be charged
after Vault access is stopped.

Direct API keys are never sent to Outlet. Your app holds the key, in the
browser or on your own server when the provider accepts calls only from a
server, and tells the user which. Work that runs after the browser closes
belongs in the Vault.

## Several providers

Create a separate connection for each provider your app uses. A text
connection can sit alongside connections for video and voice. If the same
provider serves several models, those models can use that provider’s
connection.

For example, an app can use Anthropic in Vault for text and fal in Vault for
video and voice. Each provider’s Vault connection has its own Vault App key,
Vault cap and revoke control. Video and voice using the same fal Vault App
key share its Vault cap.

Keep each Vault connection associated with its provider when saving,
refreshing and using it. Revoking the fal Vault connection does not revoke
the Anthropic Vault connection.

You can also offer a Direct connection, such as Replicate, alongside Vault.
Outlet never receives a Direct API key. Direct does not get Vault caps or
Outlet’s Vault revoke control. The user removes Direct access on the
provider’s website.

## What your app never sees (vault mode)

- The user's root API key or account credentials
- Other apps' keys or spend
- Anything after revocation. A revoked grant stops working

The user's own key, in your app, by their choice. Validated, never an admin
credential. The same API you keep when you upgrade to vault mode.

## What Outlet never does

No proxying. No token markup. No model routing. No prompt storage. Free for
end users, forever. Direct mode is free. The vault is the paid product for
developers. MIT licensed.

---

Docs: [useoutlet.dev](https://useoutlet.dev) · [Source](https://github.com/PARZ1V3L/outlet) · Contact: hello@useoutlet.dev
