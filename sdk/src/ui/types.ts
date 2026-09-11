/** Connect your AI widget: the public types of `@useoutlet/sdk/ui`. */
import type { OutletSession, Provider } from "../types.js";

/** The providers the widget has screens for. The core's direct() still
 *  accepts any OpenAI-compatible provider; the widget refuses others at
 *  mount so a developer learns early, not from an empty provider list. */
export type UiProvider = "openai" | "anthropic" | "google";

/** Which doors the button opens. "both" offers the choice; a single mode
 *  never shows the other one. */
export type ConnectMode = "direct" | "vault" | "both";

export interface ConnectButtonOptions {
  mode: ConnectMode;
  /** The providers your app supports. Direct offers each of them; a Vault
   *  request names one, the first Vault-capable provider in the list. */
  providers: Provider[];
  /** Vault: your registered app id (app_…). */
  appId?: string;
  /** Vault: the registered return address handleRedirect() runs on. */
  redirectUri?: string;
  /** Vault: the monthly cap proposed on the grant screen, in USD. */
  requestedCapUsd?: number;
  /** Vault: the API base URL (staging). Defaults to the production vault. */
  baseUrl?: string;
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
