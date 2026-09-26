<p align="center">
  <a href="https://useoutlet.dev"><img src="https://useoutlet.dev/og.png" alt="outlet: use the AI power you already pay for" width="640"></a>
</p>

<p align="center">
  <a href="https://pypi.org/project/useoutlet/"><img src="https://img.shields.io/pypi/v/useoutlet?labelColor=18181A&color=D6F436" alt="PyPI version"></a>
  <img src="https://img.shields.io/badge/dependencies-0-D6F436?labelColor=18181A" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-D6F436?labelColor=18181A" alt="type hints included">
  <img src="https://img.shields.io/badge/license-MIT-D6F436?labelColor=18181A" alt="MIT license">
</p>

# useoutlet

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

This is the Python SDK, the server side of Outlet. It starts a Vault
connection, takes the session back, and refreshes, checks and revokes it.
Standard library only. Python 3.10 and up. The Connect your AI button, the
CLI and the MCP docs server live in the npm package,
[@useoutlet/sdk](https://www.npmjs.com/package/@useoutlet/sdk).

## Why

- Users already pay for AI. They shouldn't pay again inside every app.
- Developers shouldn't store customer API keys (breach target, compliance).
- Raw keys are all-or-nothing. Outlet keys are per-app, capped, revocable.

## Install

```sh
pip install useoutlet
```

## Quickstart

```sh
pip install useoutlet
```

Start a Vault connection from your server. Vault needs a registered app ID
and app secret. [Register your app](https://useoutlet.dev/register) to get
them. The app secret stays on your server.

```python
import os

from useoutlet import Outlet

outlet = Outlet(app_id="app_yourapp", app_secret=os.environ["OUTLET_APP_SECRET"])

# 1. Start a Vault connection request. Send the user to its grant URL.
request = outlet.connect(providers=["openai"], requested_cap_usd=10)
print("Approve the connection at", request.grant_url)

# 2. Wait for the approval. The session holds the Vault App key.
session = outlet.wait(request.id)
print("Connected:", session.grant_id)

# 3. Call the provider like you already do, with its official SDK.
# ai = OpenAI(api_key=session.keys["openai"])
```

Save it as quickstart.py and run it.

```sh
python quickstart.py
```

`session.keys["openai"]` holds the Vault App key. Store `session.grant_id`,
not the key. Then call the provider like you already do, with its official
SDK.

### When a connection ends

A connection can end while your app is running: the user's Vault connection
is paused at its cap, revoked or disconnected, or its refresh token is gone.
The SDK turns each into one typed error, `ConnectionEndedError`, with
`reason` (`capped`, `revoked` or `expired`) and `grant_id`. `status()`,
`refresh()` and `wait()` raise it.

```python
from useoutlet import ConnectionEndedError

try:
    info = outlet.status(session.grant_id)
except ConnectionEndedError as e:
    print(e.reason)  # "capped", "revoked" or "expired"
```

For a capped connection, the user raises the cap on useoutlet.dev and
`refresh()` returns the key. For a revoked or expired one, ask the user to
connect again.

## Usage today (direct mode)

Your user pastes their own API key; the SDK validates it locally (catches
provider mix-ups, **refuses admin keys**) and hands back a session. No
network, nothing sent to Outlet. A local format check.

```python
from useoutlet import direct

session = direct({"openai": user_pasted_key})

from openai import OpenAI

ai = OpenAI(api_key=session.keys["openai"])
```

Works with **any OpenAI-compatible provider**. Pass the key under that
provider and point the OpenAI SDK at its base URL:

```python
session = direct({"groq": user_pasted_key})

ai = OpenAI(api_key=session.keys["groq"], base_url="https://api.groq.com/openai/v1")
```

OpenAI, Anthropic, and Google get strict key-format checks (mix-ups caught,
admin keys refused); other providers are accepted with the same admin-key
safety check, since their key formats vary.

## Vault mode (the same session)

Same session shape. The pasted key becomes an App key: provisioned inside the
user's own account for your app alone, capped, and revocable.

```python
# later: re-fetch keys (session.grant_id is the thing you persist)
fresh = outlet.refresh(session.grant_id)

# check spend / status
info = outlet.status(session.grant_id)
print(f"{info.spend_usd} of {info.cap_usd} used")

# the app's side of revoke
outlet.revoke(session.grant_id)
```

### No app secret? Public clients use PKCE

An app without an app secret registers as a **public client** instead: no
secret, just a registered return address. Grant creation is secured by PKCE
(protocol docs at [useoutlet.dev](https://useoutlet.dev)), so the flow spans
the return address in two calls:

```python
outlet = Outlet(app_id="app_yourapp")  # no secret: a public client

# on your [ Connect your AI ] route: generates PKCE, send the user to the grant URL
request = outlet.connect(providers=["anthropic"], redirect_uri="https://yourapp.com/outlet/return")

# on the route at the return address: verifies state, exchanges the code
session = outlet.exchange(code, state)
ai = Anthropic(api_key=session.keys["anthropic"])

# session.refresh_token (not an app secret) authorizes later calls. The client holds it.
fresh = outlet.refresh(session.grant_id)
# fresh.refresh_token replaces the one you sent; the old one now gets 401. Store the new one.
```

The provider key arrives only on the back-channel exchange, never in the
redirect URL. The `refresh_token` belongs to this one grant.

Outlet registers `http://localhost/outlet/return` for every app. It matches
any port.

The client holds each grant's refresh token in memory. From another process,
pass `refresh_token=` to `refresh()`, `status()` or `revoke()` from your own
store, and pass the `GrantRequest` you kept to `exchange()`. `AsyncOutlet`
has the same methods for asyncio apps.

Example: [examples/python/](https://github.com/PARZ1V3L/outlet/tree/main/examples/python),
a FastAPI app with the connect route and the return address.

## Several providers

Create a separate connection for each provider your app uses. A text
connection can sit alongside connections for video and voice. If the same
provider serves several models, those models can use that provider’s
connection.

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
