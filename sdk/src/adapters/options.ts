/**
 * Shared by the React hook and the Vue composable: which option changes
 * mount the button again, and how the two handlers stay current without
 * a remount.
 */
import type { ConnectButtonOptions } from "../ui/types.js";

/**
 * The remount key: the fields the button reads once, at mount, compared
 * by value. When it changes, the adapter destroys the button and mounts
 * it again on the same element. `session` is compared by identity beside
 * it. The two handlers are not part of the key: see currentOptions().
 */
export function mountKey(o: ConnectButtonOptions): string {
  return JSON.stringify([o.mode, o.providers, o.appId, o.redirectUri, o.requestedCapUsd, o.baseUrl, o.theme]);
}

/**
 * The options handed to mountConnectButton(): the values the app holds
 * now, with onSession and onError forwarding to whatever the app holds
 * when they fire. A handler written inline, new on every render, reaches
 * the button without a remount and never goes stale.
 */
export function currentOptions(read: () => ConnectButtonOptions): ConnectButtonOptions {
  return {
    ...read(),
    onSession: (session) => read().onSession(session),
    onError: (error) => read().onError?.(error),
  };
}
