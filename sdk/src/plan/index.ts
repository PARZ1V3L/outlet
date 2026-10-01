/**
 * @useoutlet/sdk/plan: the ChatGPT plan way in, for apps that run on the
 * user's own machine.
 *
 * The user signs in at OpenAI and approves your app. Your app gets the same
 * OutletSession the other ways in return, with an hour-long token in
 * `keys.openai` that spends the user's ChatGPT plan. No Outlet server is
 * touched: no token goes to Outlet, and nothing here calls api.useoutlet.dev.
 *
 * OpenAI allows ChatGPT plan use in open-source apps and in personal projects
 * that run on the user's own machine. A paid or hosted app needs OpenAI's
 * approval first.
 *
 *   import { connectPlan, restorePlan } from "@useoutlet/sdk/plan";
 *
 *   const who = { provider: "openai", appName: "Your App" } as const;
 *   const session = (await restorePlan(who)) ?? (await connectPlan(who));
 *   const ai = new OpenAI({ apiKey: session.keys.openai });
 *
 * Node only: it listens on 127.0.0.1 and keeps the sign-in in a file.
 */
import { isPlanSession, planEndOfAnswer } from "../plan-ends.js";
import { OutletError, type OutletSession } from "../types.js";
import { type PlanOptions, checked } from "./connect.js";
import { type PlanEndpoints, discover, endpointsOf, postForm } from "./endpoints.js";
import { type PlanSession, expired, refreshDue, renew, toSession } from "./session.js";
import { type PlanStore, planFileStore } from "./store.js";
import { NODE_ONLY, WORDS, fail } from "./words.js";

if (typeof document !== "undefined") {
  throw new OutletError(NODE_ONLY, "plan_node_only");
}

export { connectPlan, type ConnectPlanOptions, type PlanOptions } from "./connect.js";
export type { PlanEndpoints } from "./endpoints.js";
export type { PlanSession } from "./session.js";
export { planFileStore, type PlanRecord, type PlanStore } from "./store.js";
export { planStreamEnd } from "../plan-ends.js";

function planSession(session: OutletSession): PlanSession {
  const s = session as Partial<PlanSession> | null;
  if (!s || !isPlanSession(s as OutletSession) || typeof s.keys?.openai !== "string") fail(WORDS.session, "plan_session_required");
  if (typeof s.appName !== "string" || s.appName.trim() === "") fail(WORDS.appName, "plan_app_name");
  return s as PlanSession;
}

/**
 * The saved sign-in as a session, or null when there is none. No browser. A
 * token near its end is refreshed first. Throws ConnectionEndedError when the
 * saved sign-in can no longer be refreshed.
 */
export async function restorePlan(o: PlanOptions): Promise<PlanSession | null> {
  const { appName } = checked(o);
  const ep = endpointsOf(o.endpoints);
  const store = o.store ?? planFileStore(appName);
  const saved = await store.load();
  const session = saved ? toSession(saved) : null;
  if (!saved || !session) return null;
  if (!refreshDue(saved)) return session;
  try {
    return toSession(await renew(store, ep, { grantId: session.grantId, force: false }));
  } catch (e) {
    // A temporary failure is not an end: a token that still has time left is still good.
    const temporary = e instanceof OutletError && (e.code === "plan_refresh_failed" || e.code === "plan_unreachable");
    if (temporary && !expired(saved)) return session;
    throw e;
  }
}

/**
 * A session with a new token. OpenAI rotates the refresh token on every
 * refresh. The new one is saved to the store before this returns. Throws
 * ConnectionEndedError when the connection has ended: "expired" when the
 * refresh token no longer works, "revoked" when the user disconnected the app.
 */
export async function refreshPlan(
  session: OutletSession,
  o: { store?: PlanStore; endpoints?: Partial<PlanEndpoints> } = {},
): Promise<PlanSession> {
  const s = planSession(session);
  const store = o.store ?? planFileStore(s.appName);
  const next = await renew(store, endpointsOf(o.endpoints), { grantId: s.grantId, held: s.keys.openai, force: true });
  return toSession(next) as PlanSession;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Delete the local sign-in. The renewable session is ended at OpenAI first.
 * `revoked` is false when OpenAI did not confirm that: tell the user. The
 * app stays listed at OpenAI until the user disconnects it there, in
 * ChatGPT Settings, Usage (https://chatgpt.com/settings/usage).
 */
export async function forgetPlan(o: PlanOptions): Promise<{ revoked: boolean }> {
  const { appName } = checked(o);
  const ep = endpointsOf(o.endpoints);
  const store = o.store ?? planFileStore(appName);
  const saved = await store.load();
  let revoked = false;
  if (saved?.refreshToken && saved.clientId) {
    for (let attempt = 0; attempt < 3 && !revoked; attempt++) {
      if (attempt) await pause(300 * 3 ** (attempt - 1));
      try {
        const { revocation } = await discover(ep);
        if (!revocation) break;
        const answer = await postForm(revocation, {
          token: saved.refreshToken,
          token_type_hint: "refresh_token",
          client_id: saved.clientId,
        });
        // An empty 200 is success, also for a token that was already dead.
        if (answer.status === 200) revoked = true;
        else if (answer.status < 500) break;
      } catch {
        /* OpenAI could not be reached: try again, then forget locally anyway */
      }
    }
  }
  await store.clear();
  return { revoked };
}

/** A model the signed-in account may use. Pass `slug` as `model`. */
export interface PlanModel {
  slug: string;
  displayName: string;
  description?: string;
}

/** The models the signed-in account may use, in OpenAI's order. */
export async function planModels(
  session: OutletSession,
  o: { endpoints?: Partial<PlanEndpoints> } = {},
): Promise<PlanModel[]> {
  const s = planSession(session);
  const ep = endpointsOf(o.endpoints);
  let res: Response;
  try {
    res = await fetch(`${ep.api}/models`, { headers: { authorization: `Bearer ${s.keys.openai}`, accept: "application/json" } });
  } catch {
    throw new OutletError(WORDS.unreachable, "plan_unreachable");
  }
  if (!res.ok) {
    const end = await planEndOfAnswer(res, s.grantId);
    throw end ?? new OutletError(WORDS.models(res.status), "plan_models_failed", res.status);
  }
  const body = (await res.json().catch(() => null)) as { models?: unknown } | null;
  const all = Array.isArray(body?.models) ? (body.models as Record<string, unknown>[]) : [];
  return all
    .filter((m) => m && m.visibility === "list" && typeof m.slug === "string")
    .map((m) => ({
      slug: m.slug as string,
      displayName: typeof m.display_name === "string" ? m.display_name : (m.slug as string),
      ...(typeof m.description === "string" ? { description: m.description } : {}),
    }));
}
