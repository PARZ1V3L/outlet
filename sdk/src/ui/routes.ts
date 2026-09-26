/**
 * The route contract: which screen opens first, where each screen goes,
 * where Back leads. Pure functions over the mount configuration so the
 * rules are testable without a DOM.
 */
import type { ConnectMode, CustomProvider, UiProvider } from "./types.js";

export interface Config {
  mode: ConnectMode;
  /** Direct providers, in the app's order. */
  direct: UiProvider[];
  /** The one provider a Vault request names, or null when Vault is off. */
  vault: UiProvider | null;
  /** The providers outside the registry, as the app described them. */
  custom?: Record<string, CustomProvider>;
  /** Direct: where the app keeps the Direct API key, when the app says. */
  directKeyStorage?: "browser" | "server";
}

export type DirectStep = "entry" | "guide" | "paste" | "checking" | "connected";
export type VaultStep = "explain" | "leaving" | "connected" | "start-error" | "return-error" | "return-checking";
type VaultScreen = Exclude<VaultStep, "explain"> | "explain" | "only";

export const DIRECT_ERRORS = [
  "direct-error-empty", "direct-error-format", "direct-error-wrong-provider",
  "direct-error-admin-refused", "direct-error-unsupported", "direct-error-handoff-error",
] as const;
export type DirectErrorId = (typeof DIRECT_ERRORS)[number];

/** OpenAI's Vault screens keep the ids they had before a second provider
 *  had any: "vault-explain". Every other provider's carry its id:
 *  "vault-anthropic-explain", "vault-fal-explain". */
export type StateId =
  | "choose"
  | "direct-provider"
  | "direct-only"
  | `direct-${string}-${DirectStep}`
  | DirectErrorId
  | `vault-${VaultScreen}`
  | `vault-${string}-${VaultScreen}`;

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

export function isDirectError(id: string): id is DirectErrorId {
  return (DIRECT_ERRORS as readonly string[]).includes(id);
}

export function directView(id: DirectStep, provider: UiProvider): View {
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
  const screen: VaultScreen = step === "explain" && cfg.mode === "vault" ? "only" : step;
  if (!provider || provider === "openai") return { id: `vault-${screen}` };
  return { id: `vault-${provider}-${screen}` };
}

/** The provider a Vault screen's id names. */
export function vaultProviderOf(id: string): UiProvider {
  const m = /^vault-(.+)-(?:explain|only|leaving|connected|start-error|return-error|return-checking)$/.exec(id);
  return m ? (m[1] as UiProvider) : "openai";
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

/** Where Back leads, or null when this screen has no Back. Single-mode
 *  entries and the transient or final screens have none. */
export function parentView(cfg: Config, view: View): View | null {
  const { id, provider } = view;
  if (id === "choose" || id === "direct-only") return null;
  if (id === "direct-provider") return { id: "choose" };
  if (isDirectError(id)) {
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
  if (id.endsWith("-only") || id.endsWith("-return-checking") || id.endsWith("-connected")) return null;
  if (id.endsWith("-explain")) return { id: "choose" };
  // Leaving and errors go back to the explanation
  return vaultView(cfg, "explain");
}
