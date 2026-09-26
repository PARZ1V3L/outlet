/** Mount-time checks and the session binding, kept apart from the widget. */
import { getProvider, providerIds } from "../providers.js";
import { OutletError, type OutletSession } from "../types.js";
import type { Config } from "./routes.js";
import type { ConnectButtonOptions, CustomProvider, UiProvider } from "./types.js";

export interface Bound { mode: "direct" | "vault"; provider: UiProvider }

export function fail(message: string, code: string): never {
  throw new OutletError(message, code);
}

const ID_SHAPE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;

/** A described provider, checked: an id the session can file a key under,
 *  a name to show, and a keys page that is a web address or absent. */
function described(item: CustomProvider): CustomProvider {
  const { id, name, keysUrl } = item;
  if (typeof id !== "string" || !ID_SHAPE.test(id)) {
    fail("A described provider needs an id of letters, digits, dots, dashes or underscores.", "ui_provider_id");
  }
  if (typeof name !== "string" || name.trim() === "") {
    fail(`The provider "${id}" needs a name to show.`, "ui_provider_name_required");
  }
  if (keysUrl === undefined || keysUrl === null || keysUrl === "") return { id, name: name.trim() };
  let url: URL | null = null;
  try {
    url = new URL(keysUrl);
  } catch {
    /* not an address at all: refused below */
  }
  if (!url || url.protocol !== "https:") {
    fail(`The keys page for "${id}" must be an https address.`, "ui_provider_keys_url");
  }
  return { id, name: name.trim(), keysUrl: url.href };
}

/** Check the options once, at mount, so a developer learns early. */
export function configure(o: ConnectButtonOptions): Config {
  if (o.mode !== "direct" && o.mode !== "vault" && o.mode !== "both") {
    fail('mode must be "direct", "vault" or "both".', "ui_mode");
  }
  if (typeof o.onSession !== "function") fail("onSession is required.", "ui_on_session_required");
  const storage = o.directKeyStorage;
  if (storage !== undefined && storage !== "browser" && storage !== "server") {
    fail('directKeyStorage must be "browser" or "server".', "ui_direct_key_storage");
  }
  const list = Array.isArray(o.providers) ? o.providers : [];
  const ids: UiProvider[] = [];
  // No prototype: an id such as "constructor" must never look described.
  const custom: Record<string, CustomProvider> = Object.create(null);
  const unknown: string[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      if (getProvider(item)) ids.push(item);
      else unknown.push(item);
    } else if (!item || typeof item !== "object") {
      unknown.push(String(item));
    } else {
      // A registry id keeps its named Direct screen, whatever else the object says.
      if (typeof item.id === "string" && getProvider(item.id)) ids.push(item.id);
      else {
        const checked = described(item);
        custom[checked.id] = checked;
        ids.push(checked.id);
      }
    }
  }
  if (unknown.length) {
    fail(
      `The Connect your AI button has no named Direct screen for: ${unknown.join(", ")}. ` +
        "For a provider outside the registry, pass { id, name, keysUrl } and the button shows the generic Direct screen.",
      "ui_provider_unsupported",
    );
  }
  const providers = Array.from(new Set(ids));
  const vault = providers.find((p) => getProvider(p)?.modes.vault) ?? null;
  if (o.mode !== "vault" && providers.length === 0) fail("providers must name at least one provider.", "ui_no_providers");
  if (o.mode !== "direct") {
    if (!vault) fail(`Vault needs one of these in providers: ${providerIds("vault").join(", ")}.`, "ui_no_vault_provider");
    if (!o.appId || !o.redirectUri) fail("Vault needs appId and redirectUri.", "ui_vault_options_required");
  }
  return {
    mode: o.mode,
    direct: o.mode === "vault" ? [] : providers,
    vault: o.mode === "direct" ? null : vault,
    custom,
    ...(storage ? { directKeyStorage: storage } : {}),
  };
}

/** The mode and provider a session connects, or null when it names no
 *  provider this button has screens for (or is not a session at all). */
export function boundFrom(session: OutletSession | null | undefined, cfg: Config): Bound | null {
  const keys = session && typeof session === "object" ? (session.keys as unknown) : null;
  if (!keys || typeof keys !== "object") return null;
  const held = keys as Record<string, unknown>;
  const provider = Object.keys(held).find(
    (k) => (getProvider(k) || cfg.custom?.[k]) && typeof held[k] === "string" && (held[k] as string).length > 0,
  );
  if (!provider || !session) return null;
  const mode = session.mode === "direct" ? "direct" : "vault";
  // Vault has screens only where the registry marks modes.vault.
  if (mode === "vault" && !getProvider(provider)?.modes.vault) return null;
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
