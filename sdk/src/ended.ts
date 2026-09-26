/**
 * Connection ends: the vault's refusals and status answers turned into
 * ConnectionEndedError, and the page told. Every end passes through
 * ended(), so a mounted Connect your AI button hears about it without the
 * app writing a line: the error is dispatched on the document as an
 * "outlet-connection-ended" event and the button bound to that grant shows
 * the screen for the reason. A runtime without a document (a server, a
 * worker) has no button to tell and dispatches nothing.
 */
import { getProvider } from "./providers.js";
import {
  ConnectionEndedError, type EndReason, type GrantInfo, OutletError, type Provider,
} from "./types.js";

export const ENDED_EVENT = "outlet-connection-ended";

function announce(e: ConnectionEndedError): void {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") return;
  document.dispatchEvent(new CustomEvent(ENDED_EVENT, { detail: e }));
}

/** The typed error, announced to the page. */
export function ended(
  reason: EndReason,
  grantId: string,
  extra: { info?: GrantInfo; provider?: Provider; status?: number } = {},
): ConnectionEndedError {
  const message = reason === "refused" && extra.provider
    ? `${getProvider(extra.provider)?.displayName ?? extra.provider} refused this Direct API key. Ask the user for a new one.`
    : undefined;
  const e = new ConnectionEndedError(reason, grantId, { ...extra, ...(message ? { message } : {}) });
  announce(e);
  return e;
}

/** The connection end behind a vault refusal, or null when the code is
 *  not one: 409 grant_capped, 409 grant_revoked, and 401 unauthorized for
 *  a refresh token the vault no longer knows (rotated away or gone). */
export function endedFromVault(e: OutletError, grantId: string): ConnectionEndedError | null {
  if (e.code === "grant_capped") return ended("capped", grantId, { status: e.status });
  if (e.code === "grant_revoked") return ended("revoked", grantId, { status: e.status });
  if (e.code === "unauthorized") return ended("expired", grantId, { status: e.status });
  return null;
}

/** The connection end a status answer reports, or null while it is open. */
export function endedFromInfo(info: GrantInfo): ConnectionEndedError | null {
  if (info.status !== "capped" && info.status !== "revoked") return null;
  return ended(info.status, info.grantId, { info, provider: info.providers[0], status: 409 });
}

/** True for a ConnectionEndedError from any copy of the SDK on the page. */
export function isConnectionEnded(e: unknown): e is ConnectionEndedError {
  if (e instanceof ConnectionEndedError) return true;
  const x = e as { code?: unknown; reason?: unknown; grantId?: unknown } | null;
  return !!x && typeof x === "object" && x.code === "connection_ended"
    && typeof x.reason === "string" && typeof x.grantId === "string";
}
