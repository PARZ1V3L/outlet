/**
 * The route contract: which screen opens first, where each screen goes,
 * where Back leads. Pure functions over the mount configuration so the
 * rules are testable without a DOM.
 */
import type { ConnectMode, UiProvider } from "./types.js";

export interface Config {
  mode: ConnectMode;
  /** Direct providers, in the app's order. */
  direct: UiProvider[];
  /** The one provider a Vault request names, or null when Vault is off. */
  vault: UiProvider | null;
}

export type StateId =
  | "choose"
  | "direct-provider"
  | "direct-only"
  | `direct-${UiProvider}-entry`
  | `direct-${UiProvider}-guide`
  | `direct-${UiProvider}-paste`
  | `direct-${UiProvider}-checking`
  | `direct-${UiProvider}-connected`
  | "direct-error-empty"
  | "direct-error-format"
  | "direct-error-wrong-provider"
  | "direct-error-admin-refused"
  | "direct-error-unsupported"
  | "direct-error-handoff-error"
  | "vault-explain"
  | "vault-only"
  | "vault-leaving"
  | "vault-connected"
  | "vault-return-error"
  | "vault-return-checking"
  | "vault-anthropic-explain"
  | "vault-anthropic-only"
  | "vault-anthropic-leaving"
  | "vault-anthropic-connected"
  | "vault-anthropic-return-error"
  | "vault-anthropic-return-checking";

export interface View {
  id: StateId;
  /** The provider this screen is about (Direct screens, the Vault ones
   *  carry it in the id). */
  provider?: UiProvider;
  /** The provider a pasted key looked like (wrong-provider, unsupported). */
  other?: UiProvider;
  /** The completion itself, not a reopen: the one time the mark winks. */
  fresh?: boolean;
}

export type VaultStep = "explain" | "leaving" | "connected" | "return-error" | "return-checking";

export function directView(id: "entry" | "guide" | "paste" | "checking" | "connected", provider: UiProvider): View {
  return { id: `direct-${provider}-${id}`, provider };
}

/** The Direct provider list, or null when one provider skips it. */
export function providerListView(cfg: Config): View | null {
  if (cfg.direct.length <= 1) return null;
  return { id: cfg.mode === "direct" ? "direct-only" : "direct-provider" };
}

/** Where "Direct" leads: the list, or straight to the one provider's entry. */
export function directStart(cfg: Config): View {
  const list = providerListView(cfg);
  if (list) return list;
  return directView("entry", cfg.direct[0] as UiProvider);
}

/** The Vault screens, by provider and by whether Vault is the only mode.
 *  The provider defaults to the one the request names; a completed
 *  connection passes the provider it actually bound. */
export function vaultView(cfg: Config, step: VaultStep, provider: UiProvider | null = cfg.vault): View {
  const single = cfg.mode === "vault";
  const anthropic = provider === "anthropic";
  if (step === "explain") {
    if (anthropic) return { id: single ? "vault-anthropic-only" : "vault-anthropic-explain" };
    return { id: single ? "vault-only" : "vault-explain" };
  }
  return { id: anthropic ? `vault-anthropic-${step}` : `vault-${step}` };
}

/** The first screen the button opens. */
export function openingView(cfg: Config): View {
  if (cfg.mode === "both") return { id: "choose" };
  if (cfg.mode === "direct") return directStart(cfg);
  return vaultView(cfg, "explain");
}

/** The connected screen for a completed connection. */
export function connectedView(cfg: Config, mode: "direct" | "vault", provider: UiProvider): View {
  return mode === "direct" ? directView("connected", provider) : vaultView(cfg, "connected", provider);
}

const noBack = new Set<string>([
  "choose", "direct-only", "vault-only", "vault-anthropic-only",
  "vault-return-checking", "vault-anthropic-return-checking",
  "vault-connected", "vault-anthropic-connected",
]);

/** Where Back leads, or null when this screen has no Back. Single-mode
 *  entries and the transient or final screens have none. */
export function parentView(cfg: Config, view: View): View | null {
  const { id, provider } = view;
  if (noBack.has(id)) return null;
  if (id === "direct-provider") return { id: "choose" };
  if (id.startsWith("direct-error-")) {
    // The two field errors are the paste screen itself, so Back goes where
    // the paste screen's Back goes. The others sit on top of it.
    if (id === "direct-error-empty" || id === "direct-error-format") {
      return provider ? directView("entry", provider) : null;
    }
    return provider ? directView("paste", provider) : null;
  }
  if (id.startsWith("direct-")) {
    if (!provider) return null;
    if (id.endsWith("-checking") || id.endsWith("-connected")) return null;
    if (id.endsWith("-entry")) {
      const list = providerListView(cfg);
      if (list) return list;
      return cfg.mode === "both" ? { id: "choose" } : null;
    }
    return directView("entry", provider);
  }
  if (id === "vault-explain" || id === "vault-anthropic-explain") return { id: "choose" };
  // leaving and return-error go back to the explanation
  return vaultView(cfg, "explain");
}
