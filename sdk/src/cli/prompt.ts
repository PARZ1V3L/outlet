/**
 * The setup prompt: the fenced block under "Building with an AI? Paste this
 * into your AI." in sdk/README.md, byte for byte. A test holds the two
 * together. The MCP server's outlet_setup_prompt tool serves this text, and
 * the Claude Code skill and the Cursor rule under ai-tools/ carry it too.
 */
export const SETUP_PROMPT = `Add Outlet to this app so users can connect their own AI account.
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
`;
