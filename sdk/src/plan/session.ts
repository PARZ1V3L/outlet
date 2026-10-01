/**
 * A saved sign-in as a session, and the refresh. OpenAI rotates the refresh
 * token on every refresh, so one refresh runs at a time for a store and the
 * new token is saved before anything is returned.
 */
import { randomBytes } from "node:crypto";
import { planEnded } from "../plan-ends.js";
import { type EndReason, OutletError, type OutletSession } from "../types.js";
import { PLAN_SCOPE, type PlanEndpoints, errorCode, postForm } from "./endpoints.js";
import type { PlanRecord, PlanStore } from "./store.js";
import { WORDS } from "./words.js";

/** The same OutletSession every way in returns, plus the app's name: with it
 *  refreshPlan() finds the default store. The refresh token is not on it. */
export type PlanSession = OutletSession & { mode: "plan"; appName: string };

/** OpenAI's page: access tokens last one hour. Used only if an answer leaves `expires_in` out. */
const HOUR = 3600;
/** A refresh is due this long before the expiry when OpenAI names no time. */
const REFRESH_AHEAD_MS = 6 * 60 * 1000;

/** Not a secret: a local handle apps can log and store safely. */
export function localId(): string {
  return `plan_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

export function toSession(r: PlanRecord): PlanSession | null {
  if (!r.accessToken || !r.grantId || !r.expiresAt) return null;
  return {
    grantId: r.grantId,
    keys: { openai: r.accessToken },
    // No Outlet cap here: the limit is the user's own setting at OpenAI.
    capUsd: Number.POSITIVE_INFINITY,
    expiresAt: r.expiresAt,
    mode: "plan",
    appName: r.appName,
  };
}

/** The record with a token answer folded in. The access token, its expiry,
 *  the granted scopes and the rotated refresh token are replaced together. */
export function withTokens(r: PlanRecord, tok: Record<string, unknown>, now = Date.now()): PlanRecord {
  const lifetime = typeof tok.expires_in === "number" && tok.expires_in > 0 ? tok.expires_in : HOUR;
  const expires = now + lifetime * 1000;
  const due = typeof tok.earliest_refresh_at === "number" ? tok.earliest_refresh_at * 1000 : expires - REFRESH_AHEAD_MS;
  const text = (v: unknown, kept: string | undefined) => (typeof v === "string" && v ? v : kept);
  return {
    ...r,
    accessToken: text(tok.access_token, undefined),
    refreshToken: text(tok.refresh_token, r.refreshToken),
    idToken: text(tok.id_token, r.idToken),
    scopes: typeof tok.scope === "string" ? tok.scope.split(/\s+/).filter(Boolean) : (r.scopes ?? []),
    expiresAt: new Date(expires).toISOString(),
    earliestRefreshAt: new Date(Math.min(due, expires)).toISOString(),
    savedAt: new Date(now).toISOString(),
  };
}

/** True once OpenAI's refresh time has come (six minutes before the expiry). */
export function refreshDue(r: PlanRecord, now = Date.now()): boolean {
  const due = Date.parse(r.earliestRefreshAt ?? "") || (Date.parse(r.expiresAt ?? "") || 0) - REFRESH_AHEAD_MS;
  return now >= due;
}

export function expired(r: PlanRecord, now = Date.now()): boolean {
  return now >= (Date.parse(r.expiresAt ?? "") || 0);
}

/** OpenAI's refresh errors that end the connection (its errors page). */
const REFRESH_ENDS: Record<string, EndReason> = {
  invalid_grant: "expired",
  invalid_refresh_token: "expired",
  token_expired: "expired",
  refresh_token_expired: "expired",
  refresh_token_reused: "expired",
  refresh_token_invalidated: "revoked",
  invalid_client: "revoked",
};

/** Tokens that no longer work are removed. The registration stays for the
 *  next sign-in, unless OpenAI no longer knows the client. */
function withoutTokens(r: PlanRecord, clientGone: boolean): PlanRecord {
  const { accessToken: _a, refreshToken: _r, expiresAt: _e, earliestRefreshAt: _d, grantId: _g, ...kept } = r;
  if (!clientGone) return kept;
  const { clientId: _c, idToken: _i, ...bare } = kept;
  return bare;
}

/** One at a time per store object, for a store with no lock of its own. */
const queues = new WeakMap<PlanStore, Promise<unknown>>();
function oneAtATime<T>(store: PlanStore, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(store) ?? Promise.resolve()).then(run, run);
  queues.set(store, next.catch(() => undefined));
  return next;
}

/**
 * Refresh the saved sign-in and return the new record. `held` is the access
 * token the caller holds: when the store already has a newer one that is not
 * due, another call or process did the refresh and its result is returned,
 * so a rotated token is never spent twice.
 */
export function renew(
  store: PlanStore,
  ep: PlanEndpoints,
  o: { grantId: string; held?: string; force: boolean },
): Promise<PlanRecord> {
  return oneAtATime(store, async () => {
    const release = await store.lock?.();
    try {
      const r = await store.load();
      if (!r?.refreshToken || !r.clientId || !r.grantId) throw planEnded("expired", o.grantId);
      const fresh = !refreshDue(r);
      if (fresh && (!o.force || (o.held !== undefined && r.accessToken !== o.held))) return r;

      const answer = await postForm(ep.token, {
        grant_type: "refresh_token",
        client_id: r.clientId,
        refresh_token: r.refreshToken,
        resource: ep.api,
      });
      if (answer.status === 200 && typeof answer.body?.access_token === "string") {
        const next = withTokens(r, answer.body);
        // The old refresh token is void now. The new one is saved before anything else.
        await store.save(next);
        if (!next.scopes?.includes(PLAN_SCOPE)) throw planEnded("revoked", r.grantId);
        return next;
      }
      const code = errorCode(answer.body);
      const reason = Object.prototype.hasOwnProperty.call(REFRESH_ENDS, code) ? REFRESH_ENDS[code] : undefined;
      if (reason) {
        await store.save(withoutTokens(r, code === "invalid_client"));
        throw planEnded(reason, r.grantId, answer.status);
      }
      // A temporary failure is not an end. The saved sign-in is left as it is.
      throw new OutletError(WORDS.refreshFailed(answer.status), "plan_refresh_failed", answer.status);
    } finally {
      await release?.();
    }
  });
}
