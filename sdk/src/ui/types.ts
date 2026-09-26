/** Connect your AI widget: the public types of `@useoutlet/sdk/ui`. */
import type { OutletSession, Provider } from "../types.js";

/** A provider id the button shows screens for: a provider registry id
 *  (providers.ts), or the id of a provider the app describes itself. */
export type UiProvider = Provider;

/** A provider outside the registry. The button shows it the generic Direct
 *  screen with this name and this keys page. A registry id keeps its named
 *  Direct screen, whatever else the object says. */
export interface CustomProvider {
  /** The key the session files this provider's key under: session.keys[id]. */
  id: string;
  /** The provider's display name, as its users know it. */
  name: string;
  /** The provider's official page for getting a key (https). Without one,
   *  the screen says the app gave none and still takes a key the person has. */
  keysUrl?: string;
}

/** Which doors the button opens. "both" offers the choice; a single mode
 *  never shows the other one. */
export type ConnectMode = "direct" | "vault" | "both";

export interface ConnectButtonOptions {
  mode: ConnectMode;
  /** The providers your app supports. Direct offers each of them: a
   *  registry id gets its named Direct screen, a CustomProvider the generic
   *  one. A Vault request names one provider, the first in the list the
   *  registry marks modes.vault. */
  providers: Array<Provider | CustomProvider>;
  /** Vault: your registered app id (app_…). */
  appId?: string;
  /** Vault: the registered return address handleRedirect() runs on. */
  redirectUri?: string;
  /** Vault: the monthly cap proposed on the grant screen, in USD. */
  requestedCapUsd?: number;
  /** Vault: the API base URL (staging). Defaults to the production vault. */
  baseUrl?: string;
  /** Direct: where your app keeps the person's Direct API key after the
   *  paste, in their browser or on your server. When set, the Direct paste
   *  screen says so in one line. Unset, the screen says nothing about it. */
  directKeyStorage?: "browser" | "server";
  /** Receives the session once a connection completes. The button turns
   *  Connected only after this resolves; a throw shows the try-again
   *  state and hands nothing else over. */
  onSession: (session: OutletSession) => void | Promise<void>;
  /** Failures that are not the user's to fix: the vault unreachable, a
   *  billing gate, a rejected return, a returned session with no key this
   *  button knows (ui_session_unbound), an onSession that threw. The sheet
   *  shows its own words and carries on if this handler throws. */
  onError?: (error: unknown) => void;
  /** "auto" follows prefers-color-scheme. */
  theme?: "auto" | "light" | "dark";
  /** A session the app already holds, or the pending handleRedirect() on
   *  the return page. A held session mounts the Connected button; a
   *  pending one opens the sheet on "Checking your Vault connection" and
   *  delivers the result to onSession when it resolves. Pass
   *  handleRedirect() only on a load that carries the grant screen's
   *  ?code and ?state; any other visit mounts with the stored session or
   *  none. */
  session?: OutletSession | Promise<OutletSession>;
}

export interface ConnectButtonHandle {
  /** Open the sheet on the first screen, or on the connected screen once
   *  a connection completed. */
  open(): void;
  /** Close the sheet, clear any pasted key, return focus to the button. */
  close(): void;
  /** Close, unwire, and leave the target empty. */
  destroy(): void;
}
