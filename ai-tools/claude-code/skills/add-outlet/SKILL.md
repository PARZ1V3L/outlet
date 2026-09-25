---
name: add-outlet
description: "Add the Connect your AI button from Outlet to a web app. Direct: the user pastes their own API key. Vault: the user connects an account with an admin key. Use when asked to add Outlet or to let users use their own OpenAI, Anthropic, fal or OpenRouter account."
---

Read https://useoutlet.dev/llms-full.txt first. If the outlet_docs MCP tool is available, call it instead.

```text
Add Outlet to this app so users can connect their own AI account.
Read https://useoutlet.dev/llms-full.txt first.
Install: npm install @useoutlet/sdk
App ID: <from useoutlet.dev/register>
Return address: <the https or private-scheme return address>
Local testing: http://localhost/outlet/return, any port
Button: import { mountConnectButton } from "@useoutlet/sdk/ui".
Mount on an empty div with mode: "both", providers, appId and redirectUri.
React or Vue: use useConnectButton from "@useoutlet/sdk/react" or "@useoutlet/sdk/vue".
Vault return: pass Outlet.handleRedirect() as session only when the return address has code and state.
Receive the Direct or Vault session through onSession.
No app secret in the app.
Vault provider: choose openai, anthropic, fal or openrouter. Use a separate Vault connection request for each provider.
Place the Connect your AI button where users connect their AI account.
After connect: call the provider with its official SDK using session.keys.<provider>.
```

Ask for the app ID and the return address if Vault is wanted and they were not given.
