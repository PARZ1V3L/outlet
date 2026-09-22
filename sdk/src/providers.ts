/**
 * The provider registry: every provider the Connect your AI button has a
 * named Direct screen for, with the facts each screen shows and the record
 * of how each fact was checked. `npm run build` writes it to providers.json.
 *
 * Ids are company names. Display names are the names people know the
 * product by. A provider's kind is "maker" (it serves its own models) or
 * "host" (it serves other makers' models).
 *
 * direct() accepts any provider's key as an opaque value. `keyShape` and
 * `formatHint` describe a key to the person pasting it. Neither refuses one.
 */

export type ProviderId =
  | "openai" | "anthropic" | "google" | "deepseek" | "xai" | "moonshot" | "mistral"
  | "zai" | "minimax" | "perplexity" | "openrouter" | "groq" | "cerebras" | "together"
  | "fireworks" | "higgsfield" | "huggingface" | "fal" | "replicate";

export type ProviderKind = "maker" | "host";

/** What the provider's documentation says a key looks like. */
export interface KeyShape {
  /** The characters the key starts with. */
  prefix?: string;
  /** Two parts joined by `separator`, written the way the documentation writes them. */
  pattern?: string;
  separator?: string;
  /** The length in characters, where the documentation gives one. */
  length?: number;
  /** "stated": the page says it in a sentence. "example": the page shows it in an example. */
  basis: "stated" | "example";
  /** The documentation page that states or shows it. */
  source: string;
}

/** One check of a provider in one mode. "docs": read against the provider's
 *  documentation. "request": proved with a real request. */
export interface ProviderCheck {
  mode: "direct" | "vault";
  how: "docs" | "request";
  /** The day of the check, YYYY-MM-DD. */
  date: string;
  /** The documentation page read, or the operation requested. */
  source: string;
}

export interface ProviderEntry {
  id: ProviderId;
  displayName: string;
  kind: ProviderKind;
  /** The provider's page for creating a key. */
  keysUrl: string;
  /** The provider's own word for the key. */
  keyTerm: string;
  /** The guide's second step, in the provider's words. */
  createAction: string;
  /** The line under the paste field. Copy, never a check. */
  formatHint: string;
  /** Null where the documentation read does not give one. */
  keyShape: KeyShape | null;
  /** The provider documents an endpoint the OpenAI SDK can call through `baseURL`. */
  openaiCompatible: boolean;
  modes: { direct: boolean; button: boolean; vault: boolean };
  checks: ProviderCheck[];
}

const CHECKED = "2026-09-18";
const docs = (mode: "direct" | "vault", source: string): ProviderCheck =>
  ({ mode, how: "docs", date: CHECKED, source });
const starts = (prefix: string, basis: KeyShape["basis"], source: string, length?: number): KeyShape =>
  (length ? { prefix, length, basis, source } : { prefix, basis, source });
const joined = (pattern: string, separator: string, basis: KeyShape["basis"], source: string): KeyShape =>
  ({ pattern, separator, basis, source });

const DIRECT = { direct: true, button: true, vault: false };
const DIRECT_AND_VAULT = { direct: true, button: true, vault: true };
const API_KEY = "API key";
const CREATE = "Create an API key.";

export const providers: readonly ProviderEntry[] = [
  {
    id: "openai", displayName: "OpenAI", kind: "maker",
    keysUrl: "https://platform.openai.com/api-keys", keyTerm: API_KEY,
    createAction: "Create an API key. OpenAI calls it a secret key.",
    formatHint: "Paste your whole OpenAI Direct API key.",
    keyShape: starts("sk-", "example", "https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys/methods/list"),
    openaiCompatible: true, modes: DIRECT_AND_VAULT,
    checks: [
      docs("direct", "https://developers.openai.com/api/docs/quickstart"),
      docs("vault", "https://developers.openai.com/api/reference/administration/overview"),
    ],
  },
  {
    id: "anthropic", displayName: "Anthropic", kind: "maker",
    keysUrl: "https://platform.claude.com/settings/keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Paste your whole Anthropic Direct API key.",
    keyShape: starts("sk-ant-", "stated", "https://platform.claude.com/docs/en/get-api-key"),
    openaiCompatible: true, modes: DIRECT_AND_VAULT,
    checks: [
      docs("direct", "https://platform.claude.com/docs/en/get-api-key"),
      docs("vault", "https://platform.claude.com/docs/en/manage-claude/admin-api"),
    ],
  },
  {
    id: "google", displayName: "Gemini", kind: "maker",
    keysUrl: "https://aistudio.google.com/api-keys", keyTerm: API_KEY,
    createAction: "Create an API key in Google AI Studio.",
    formatHint: "Your Gemini Direct API key starts with AIza.",
    keyShape: starts("AIza", "example", "https://docs.cloud.google.com/docs/authentication/api-keys"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://ai.google.dev/gemini-api/docs/api-key")],
  },
  {
    id: "deepseek", displayName: "DeepSeek", kind: "maker",
    keysUrl: "https://platform.deepseek.com/api_keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your DeepSeek Direct API key starts with sk-.",
    keyShape: starts("sk-", "stated", "https://api-docs.deepseek.com/quick_start/agent_integrations/copilot_cli/"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://api-docs.deepseek.com/")],
  },
  {
    id: "xai", displayName: "Grok", kind: "maker",
    keysUrl: "https://console.x.ai/team/default/api-keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your Grok Direct API key starts with xai-.",
    keyShape: starts("xai-", "example", "https://docs.x.ai/developers/rest-api-reference/management/auth"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://docs.x.ai/developers/quickstart")],
  },
  {
    id: "moonshot", displayName: "Kimi", kind: "maker",
    keysUrl: "https://platform.kimi.ai/console/api-keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Paste your whole Kimi Direct API key.",
    keyShape: null,
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://platform.kimi.ai/docs/overview")],
  },
  {
    id: "mistral", displayName: "Mistral", kind: "maker",
    keysUrl: "https://console.mistral.ai/api-keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Paste your whole Mistral Direct API key.",
    keyShape: null,
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://docs.mistral.ai/getting-started/quickstarts/developer/first-api-request")],
  },
  {
    id: "zai", displayName: "Z.ai", kind: "maker",
    keysUrl: "https://z.ai/manage-apikey/apikey-list", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Paste your whole Z.ai Direct API key in id.secret format, including the dot.",
    keyShape: joined("id.secret", ".", "example", "https://docs.z.ai/guides/develop/http/introduction"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://docs.z.ai/guides/overview/quick-start")],
  },
  {
    id: "minimax", displayName: "MiniMax", kind: "maker",
    keysUrl: "https://platform.minimax.io/user-center/basic-information/interface-key", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Paste your whole MiniMax Direct API key.",
    keyShape: null,
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://platform.minimax.io/docs/guides/quickstart-preparation")],
  },
  {
    id: "perplexity", displayName: "Perplexity", kind: "maker",
    keysUrl: "https://console.perplexity.ai/project/keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your Perplexity Direct API key starts with pplx-.",
    keyShape: starts("pplx-", "example", "https://docs.perplexity.ai/docs/admin/api-key-management"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://docs.perplexity.ai/docs/getting-started/quickstart")],
  },
  {
    id: "openrouter", displayName: "OpenRouter", kind: "host",
    keysUrl: "https://openrouter.ai/settings/keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your OpenRouter Direct API key starts with sk-or-v1-.",
    keyShape: starts("sk-or-v1-", "example", "https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key"),
    openaiCompatible: true, modes: DIRECT_AND_VAULT,
    checks: [
      docs("direct", "https://openrouter.ai/docs/api_reference/authentication"),
      docs("vault", "https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key"),
    ],
  },
  {
    id: "groq", displayName: "Groq", kind: "host",
    keysUrl: "https://console.groq.com/keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your Groq Direct API key starts with gsk_.",
    keyShape: starts("gsk_", "example", "https://console.groq.com/docs/production-readiness/security-onboarding"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://console.groq.com/docs/quickstart")],
  },
  {
    id: "cerebras", displayName: "Cerebras", kind: "host",
    keysUrl: "https://cloud.cerebras.ai", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your Cerebras Direct API key starts with csk-.",
    keyShape: starts("csk-", "stated", "https://inference-docs.cerebras.ai/integrations/kong-api-gateway"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://inference-docs.cerebras.ai/quickstart")],
  },
  {
    id: "together", displayName: "Together AI", kind: "host",
    keysUrl: "https://api.together.ai/settings/projects/~current/api-keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Paste your whole Together AI Direct API key.",
    keyShape: null,
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://docs.together.ai/docs/quickstart")],
  },
  {
    id: "fireworks", displayName: "Fireworks AI", kind: "host",
    keysUrl: "https://app.fireworks.ai/settings/users/api-keys", keyTerm: API_KEY,
    createAction: CREATE,
    formatHint: "Your Fireworks AI Direct API key starts with fw_.",
    keyShape: starts("fw_", "example", "https://docs.fireworks.ai/ecosystem/fireconnect/claude-code"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://docs.fireworks.ai/getting-started/quickstart")],
  },
  {
    // Higgsfield issues two values. Its Authorization header joins them with
    // a colon, and the Direct API key is pasted the same way.
    id: "higgsfield", displayName: "Higgsfield", kind: "host",
    keysUrl: "https://console.higgsfield.ai", keyTerm: "key ID and secret",
    createAction: "Create a key ID and secret.",
    formatHint: "Paste your key ID and secret as id:secret.",
    keyShape: joined("KEY_ID:KEY_SECRET", ":", "example", "https://docs.higgsfield.ai/docs/authentication"),
    openaiCompatible: false, modes: DIRECT,
    checks: [docs("direct", "https://docs.higgsfield.ai/docs/authentication")],
  },
  {
    id: "huggingface", displayName: "Hugging Face", kind: "host",
    keysUrl: "https://huggingface.co/settings/tokens", keyTerm: "access token",
    createAction: "Create an access token.",
    formatHint: "Your Hugging Face Direct API key starts with hf_.",
    keyShape: starts("hf_", "example", "https://huggingface.co/docs/hub/security-tokens"),
    openaiCompatible: true, modes: DIRECT,
    checks: [docs("direct", "https://huggingface.co/docs/hub/security-tokens")],
  },
  {
    id: "fal", displayName: "fal", kind: "host",
    keysUrl: "https://fal.ai/dashboard/keys", keyTerm: "key, with API scope for Direct",
    createAction: "Click Add key. Select API scope for your Direct API key, then click Create Key.",
    formatHint: "Paste the whole fal Direct API key, including the colon.",
    keyShape: joined("key_id:key_secret", ":", "stated", "https://fal.ai/docs/platform-apis/v1/keys/create"),
    openaiCompatible: false, modes: DIRECT_AND_VAULT,
    checks: [
      docs("direct", "https://fal.ai/docs/documentation/setting-up/authentication"),
      docs("vault", "https://fal.ai/docs/platform-apis/v1/keys/create"),
    ],
  },
  {
    id: "replicate", displayName: "Replicate", kind: "host",
    keysUrl: "https://replicate.com/account/api-tokens", keyTerm: "API token",
    createAction: "Create an API token and name it after this app.",
    formatHint: "Your Replicate Direct API key starts with r8_.",
    keyShape: starts("r8_", "stated", "https://replicate.com/docs/topics/security/api-tokens", 40),
    openaiCompatible: false, modes: DIRECT,
    checks: [docs("direct", "https://replicate.com/docs/topics/security/api-tokens")],
  },
];

const byId = new Map<string, ProviderEntry>(providers.map((p) => [p.id, p]));

/** The registry entry for an id, or undefined for a provider outside it. */
export function getProvider(id: string): ProviderEntry | undefined {
  return byId.get(id);
}

/** The ids of the providers a mode covers, in registry order. */
export function providerIds(mode: keyof ProviderEntry["modes"]): ProviderId[] {
  return providers.filter((p) => p.modes[mode]).map((p) => p.id);
}
