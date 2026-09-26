/**
 * Direct (paste) mode. Vault mode is open: register your app at useoutlet.dev/register.
 *
 * The user pastes their own provider API key; direct() validates it locally
 * and returns the same OutletSession shape that connect() returns in vault
 * mode, so upgrading later is a one-line change. No network: the key never
 * leaves the process and is never sent to Outlet.
 *
 *   const session = await Outlet.direct({
 *     keys: { openai: userPastedKey },
 *   });
 *   const ai = new OpenAI({ apiKey: session.keys.openai });
 *
 * Works with any provider: pass its key under that provider's id. For an
 * OpenAI-compatible one (e.g. { groq: key }), point the OpenAI SDK at the
 * provider's baseURL. The provider registry (providers.ts) names the
 * nineteen with a named Direct screen. Its key shapes and format hints are
 * for the person pasting a key. direct() refuses no key over them.
 */

import { getProvider } from "./providers.js";
import { OutletError, OutletSession, Provider } from "./types.js";

export interface DirectOptions {
  /**
   * Provider API keys the user pasted. Validated locally (format and provider
   * mix-ups for OpenAI/Anthropic/Google; a safety check that refuses admin
   * keys for everyone), never transmitted anywhere by the SDK.
   */
  keys: Partial<Record<Provider, string>>;
}

/** The registry's display name for nicer error messages. A provider
 *  outside the registry falls back to the raw id the developer passed. */
function displayName(provider: Provider): string {
  return getProvider(provider)?.displayName ?? provider;
}

/** First-class providers with well-defined key shapes get strict validation.
 *  Order within openai matters: the generic "sk-" entry must come last. */
const ACCEPTED: Record<"openai" | "anthropic" | "google", string[]> = {
  openai: ["sk-proj-", "sk-svcacct-", "sk-"],
  anthropic: ["sk-ant-"],
  google: ["AIza"],
};

function isFirstClass(p: Provider): p is "openai" | "anthropic" | "google" {
  return p === "openai" || p === "anthropic" || p === "google";
}

function fail(message: string, code: string): never {
  throw new OutletError(message, code);
}

/**
 * Pasted keys arrive with the user's clipboard noise: surrounding
 * whitespace, sometimes quotes from a config file. Clean before judging,
 * so honest pastes don't fail format checks.
 */
function clean(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "");
}

function validateKey(provider: Provider, raw: string): string {
  const key = clean(raw);
  const name = displayName(provider);

  if (!key) fail(`Empty ${name} key.`, "invalid_key_format");

  // Admin keys are the user's root org credential. Direct mode exists precisely
  // so apps never hold one — refuse loudly for ANY provider, not just the named.
  if (key.startsWith("sk-ant-admin")) {
    fail(
      "This is an Anthropic ADMIN key. It controls the whole organization. " +
        "Never paste an admin key into an app. Use a regular API key " +
        "(starts with sk-ant-api).",
      "admin_key_rejected",
    );
  }
  if (key.startsWith("sk-admin-")) {
    fail(
      "This is an OpenAI ADMIN key. It controls the whole organization. " +
        "Never paste an admin key into an app. Use a project API key " +
        "(starts with sk-proj-).",
      "admin_key_rejected",
    );
  }

  // Provider-exclusive prefixes pasted into the wrong field are a mistake no
  // matter which provider you named: "sk-ant-" is Anthropic-only, "AIza" is
  // Google-only. The generic "sk-" is NOT exclusive (DeepSeek, Qwen, Moonshot
  // and others use it), so it is only judged among the first-class three below.
  if (provider !== "anthropic" && key.startsWith("sk-ant-")) {
    fail(
      `That looks like an ANTHROPIC key, but it was pasted into the ${name} field.`,
      "wrong_provider_key",
    );
  }
  if (provider !== "google" && key.startsWith("AIza")) {
    fail(
      `That looks like a GOOGLE key, but it was pasted into the ${name} field.`,
      "wrong_provider_key",
    );
  }

  // First-class providers (OpenAI/Anthropic/Google): strict format + mix-up.
  if (isFirstClass(provider)) {
    if (provider !== "openai" && key.startsWith("sk-") && !key.startsWith("sk-ant-")) {
      fail(
        `That looks like an OPENAI key, but it was pasted into the ${name} field.`,
        "wrong_provider_key",
      );
    }
    const prefixes = ACCEPTED[provider];
    if (!prefixes.some((p) => key.startsWith(p))) {
      fail(
        `This doesn't look like a ${name} API key (expected it to start with ` +
          `${prefixes.join(" or ")}).`,
        "invalid_key_format",
      );
    }
    return key;
  }

  // Any other provider's key is an opaque value: a token, a JWT, a generic
  // "sk-", or two parts around a colon or a dot (fal, Higgsfield, Z.ai). We
  // accept any non-empty, non-admin key whole rather than reject a valid key
  // we can't model. The registry's key shapes are never enforced here.
  return key;
}

/** Not a secret — just a local handle apps can log and store safely. */
function localId(): string {
  return `direct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate pasted provider keys and return a session, entirely locally.
 * Async only for symmetry with connect(), so swapping modes is one line.
 */
export async function direct(opts: DirectOptions): Promise<OutletSession> {
  const entries = Object.entries(opts.keys) as [Provider, string][];
  if (entries.length === 0) {
    fail("direct() needs at least one provider key.", "no_keys");
  }

  const keys: Partial<Record<Provider, string>> = {};
  for (const [provider, raw] of entries) {
    keys[provider] = validateKey(provider, raw);
  }

  return {
    grantId: localId(),
    keys,
    // No Outlet meter in direct mode; real caps arrive with vault mode.
    capUsd: Number.POSITIVE_INFINITY,
    // Direct keys live until the user revokes them in their provider console.
    expiresAt: "9999-12-31T23:59:59Z",
    mode: "direct",
  };
}

/**
 * Vault operations (refresh/status/revoke) have nothing to act on for a
 * direct-mode session — fail with directions rather than a confusing 404.
 */
export function assertVaultGrant(grantId: string): void {
  if (grantId.startsWith("direct_")) {
    fail(
      "This is a direct-mode session: there is no vault grant behind it. " +
        "To revoke, delete the key on the provider's website.",
      "direct_mode_session",
    );
  }
}
