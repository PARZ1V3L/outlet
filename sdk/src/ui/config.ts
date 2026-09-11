/** Mount-time checks and the session binding, kept apart from the widget. */
import { OutletError, type OutletSession } from "../types.js";
import type { Config } from "./routes.js";
import type { ConnectButtonOptions, UiProvider } from "./types.js";

const KNOWN: UiProvider[] = ["openai", "anthropic", "google"];

export interface Bound { mode: "direct" | "vault"; provider: UiProvider }

export function fail(message: string, code: string): never {
  throw new OutletError(message, code);
}

/** Check the options once, at mount, so a developer learns early. */
export function configure(o: ConnectButtonOptions): Config {
  if (o.mode !== "direct" && o.mode !== "vault" && o.mode !== "both") {
    fail('mode must be "direct", "vault" or "both".', "ui_mode");
  }
  if (typeof o.onSession !== "function") fail("onSession is required.", "ui_on_session_required");
  const list = Array.isArray(o.providers) ? o.providers : [];
  const unknown = list.filter((p) => !KNOWN.includes(p as UiProvider));
  if (unknown.length) {
    fail(
      `The Connect your AI button has screens for openai, anthropic and google, not for: ${unknown.join(", ")}. ` +
        "Other OpenAI-compatible providers go through direct() with your own field.",
      "ui_provider_unsupported",
    );
  }
  const providers = Array.from(new Set(list)) as UiProvider[];
  const vault = providers.find((p) => p === "openai" || p === "anthropic") ?? null;
  if (o.mode !== "vault" && providers.length === 0) fail("providers must name at least one provider.", "ui_no_providers");
  if (o.mode !== "direct") {
    if (!vault) fail("Vault needs openai or anthropic in providers.", "ui_no_vault_provider");
    if (!o.appId || !o.redirectUri) fail("Vault needs appId and redirectUri.", "ui_vault_options_required");
  }
  return {
    mode: o.mode,
    direct: o.mode === "vault" ? [] : providers,
    vault: o.mode === "direct" ? null : vault,
  };
}

/** The mode and provider a session connects, or null when it names no
 *  provider this button has screens for (or is not a session at all). */
export function boundFrom(session: OutletSession | null | undefined): Bound | null {
  const keys = session && typeof session === "object" ? (session.keys as unknown) : null;
  if (!keys || typeof keys !== "object") return null;
  const held = keys as Record<string, unknown>;
  const provider = Object.keys(held).find(
    (k) => KNOWN.includes(k as UiProvider) && typeof held[k] === "string" && (held[k] as string).length > 0,
  ) as UiProvider | undefined;
  if (!provider || !session) return null;
  const mode = session.mode === "direct" ? "direct" : "vault";
  // The Vault has no Google door: a session like that cannot name a screen.
  if (mode === "vault" && provider === "google") return null;
  return { mode, provider };
}

/** Shadow roots this module attached, so a mount after destroy() reuses
 *  its own and never wipes another component's. */
const ours = new WeakSet<ShadowRoot>();
const TARGET_WORDS =
  "mountConnectButton needs an element that can hold a shadow root and has none of its own, such as a div or a span.";

/** A shadow root on the target, or a clear error for an element that
 *  cannot hold one (a button, an input, an img) or already has one. */
export function attach(target: HTMLElement): ShadowRoot {
  const existing = target.shadowRoot;
  if (existing) {
    if (ours.has(existing)) return existing;
    fail(TARGET_WORDS, "ui_target_unsupported");
  }
  try {
    const root = target.attachShadow({ mode: "open" });
    ours.add(root);
    return root;
  } catch {
    fail(TARGET_WORDS, "ui_target_unsupported");
  }
}
