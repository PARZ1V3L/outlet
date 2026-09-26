/**
 * @useoutlet/sdk/ui: the Connect your AI button and its sheet.
 *
 * One branded button for both modes. It opens a sheet that offers Direct
 * (the person pastes their own API key, checked on the device) or Vault
 * (they connect their account on useoutlet.dev), explains why each, and
 * walks them to the right key. Direct calls the core's direct(); Vault
 * calls connectRedirect(). Nothing mounts until mountConnectButton() runs.
 *
 *   import { mountConnectButton } from "@useoutlet/sdk/ui";
 *
 *   const handle = mountConnectButton(document.querySelector("#connect"), {
 *     mode: "both",                       // "direct" | "vault" | "both"
 *     providers: ["openai", "anthropic"], // what your app supports
 *     appId: "app_yourapp",               // Vault
 *     redirectUri: "https://yourapp.com/outlet/return",
 *     onSession: (session) => {           // the same OutletSession as the core
 *       ai = new OpenAI({ apiKey: session.keys.openai });
 *     },
 *   });
 *
 * The Vault door is a full same-tab redirect to the grant screen. On the
 * page served at redirectUri, when it arrives with the ?code and ?state
 * from the grant screen, finish the grant as today and mount the button
 * again with that promise as the session; the sheet shows "Checking your
 * Vault connection" until it settles, then Connected. An ordinary visit
 * to that page (no code in the URL) mounts without a session:
 *
 *   const returning = new URL(location.href).searchParams.has("code");
 *   mountConnectButton(target, {
 *     ...sameOptions,
 *     session: returning ? Outlet.handleRedirect() : undefined,
 *   });
 *
 * A session the app already holds mounts the Connected button directly
 * (session: storedSession). handle.open(), handle.close() and
 * handle.destroy() do what they say; destroy() leaves the target empty.
 *
 * When a connection ends, the button shows one screen with the one thing
 * the person can do, in place. A Vault connection paused at its cap gets
 * Raise the Vault cap: the account page opens in a new tab, and when they
 * are back the button refreshes the session on its own and hands the new
 * one to onSession. A revoked, disconnected or expired Vault connection
 * gets Connect again, which runs the grant again. A Direct API key the
 * provider refused gets Paste a new Direct API key. The button hears about
 * the end from the core: status(), refresh() and the fetch from
 * wrapFetch() throw ConnectionEndedError and announce it on the page, so
 * the app writes nothing for it beyond receiving the new session through
 * onSession. Mount with the stored session so the button knows the grant.
 *
 * Providers: every id in the provider registry (../providers.ts) has a
 * named Direct screen with that provider's keys page, creation step and
 * format hint. A provider outside the registry gets the generic Direct
 * screen from the name and keys page your app supplies:
 *
 *   providers: ["openai", "fal", { id: "runway", name: "Runway",
 *     keysUrl: "https://dev.runwayml.com/" }],
 *
 * Vault offers only the providers the registry marks modes.vault.
 *
 * Rendering: a shadow root on the target and one on a body-level overlay,
 * styled through a constructable stylesheet (a <style> element where the
 * constructor is missing). No inline styles, no external CSS, no fonts, no
 * images, no eval: it works under a strict Content-Security-Policy. System
 * fonts only. Phase 1 is the DOM: web pages and webviews. React Native
 * comes later; this module has no native code.
 */
import type { ConnectButtonHandle, ConnectButtonOptions } from "./types.js";
import { Widget } from "./widget.js";

export type {
  ConnectButtonHandle, ConnectButtonOptions, ConnectMode, CustomProvider, UiProvider,
} from "./types.js";

/** Mount the Connect your AI button on `target`. Throws an OutletError at
 *  once for options that cannot work (a provider outside the registry with
 *  no name, Vault without appId and redirectUri, no providers). */
export function mountConnectButton(
  target: HTMLElement,
  options: ConnectButtonOptions,
): ConnectButtonHandle {
  return new Widget(target, options).handle;
}
