/**
 * What ends a ChatGPT plan session. Pure, so the fetch wrapper can use it in
 * any runtime. The sign-in itself lives in @useoutlet/sdk/plan (Node only),
 * and nothing here imports it. A plan session never touches the Outlet
 * vault: every answer read here is OpenAI's.
 *
 * OpenAI's codes are from its errors page:
 * developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
 */
import { ended } from "./ended.js";
import type { ConnectionEndedError, EndReason, OutletSession } from "./types.js";

/** What a developer reads in the stack trace, by reason. */
const PLAN_ENDED_MESSAGES: Record<EndReason, string> = {
  capped: "This ChatGPT plan connection reached its limit. The user can raise it in ChatGPT settings.",
  revoked: "This ChatGPT plan connection was disconnected. Ask the user to sign in again.",
  expired: "This ChatGPT plan connection can no longer be refreshed. Ask the user to sign in again.",
  refused: "OpenAI does not allow plan use on this account. Offer a Direct API key or Vault.",
};

/** The two Responses codes that end a plan session by themselves. Every
 *  other refusal is not an end: a temporary failure, the app's own request,
 *  or a 401 that refreshPlan() settles. */
const END_BY_CODE: Record<string, EndReason> = {
  subscription_sharing_usage_limit_exceeded: "capped",
  subscription_sharing_user_not_eligible: "refused",
};

/** True for a session from connectPlan() or restorePlan(). */
export function isPlanSession(s: Pick<OutletSession, "grantId" | "mode"> | null | undefined): boolean {
  return !!s && (s.mode === "plan" || (typeof s.grantId === "string" && s.grantId.startsWith("plan_")));
}

/** The typed error for a plan session, with the plan's own words. */
export function planEnded(reason: EndReason, grantId: string, status?: number): ConnectionEndedError {
  return ended(reason, grantId, {
    provider: "openai",
    message: PLAN_ENDED_MESSAGES[reason],
    ...(status === undefined ? {} : { status }),
  });
}

function endOfCode(code: unknown, grantId: string, status?: number): ConnectionEndedError | null {
  const reason = typeof code === "string" && Object.prototype.hasOwnProperty.call(END_BY_CODE, code)
    ? END_BY_CODE[code]
    : undefined;
  return reason ? planEnded(reason, grantId, status) : null;
}

/** The end behind a refused answer from OpenAI, or null. Reads the error
 *  code from a copy of the answer, so the caller's own stays unread. Never
 *  reads an answer that succeeded. */
export async function planEndOfAnswer(res: Response, grantId: string): Promise<ConnectionEndedError | null> {
  if (res.ok) return null;
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return null; // no JSON to read: OpenAI's answer stands
  }
  const error = (body as { error?: unknown } | null)?.error;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return endOfCode(code, grantId, res.status);
}

/**
 * The end inside a stream, or null. A plan request can fail after the stream
 * opens: OpenAI sends a `response.failed` event, and the fetch wrapper never
 * reads a stream. Hand each event here and throw what comes back.
 *
 *   for await (const event of stream) {
 *     const end = planStreamEnd(event, session);
 *     if (end) throw end;
 *   }
 */
export function planStreamEnd(
  event: unknown,
  session: Pick<OutletSession, "grantId">,
): ConnectionEndedError | null {
  const e = event as { type?: unknown; response?: { error?: { code?: unknown } | null } | null } | null;
  if (!e || typeof e !== "object" || e.type !== "response.failed") return null;
  return endOfCode(e.response?.error?.code, session.grantId);
}
