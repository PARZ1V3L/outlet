/**
 * OpenAI's addresses for ChatGPT plan use, as its pages read on 2026-10-01
 * (developers.openai.com/siwc/token-sharing-open-source), and the small
 * calls every step shares. Nothing here talks to api.useoutlet.dev.
 */
import { OutletError } from "../types.js";
import { WORDS, fail, shortCode } from "./words.js";

export interface PlanEndpoints {
  /** The ID token's issuer. */
  issuer: string;
  /** Where the browser goes to sign in. */
  authorize: string;
  /** The code exchange and the refresh. */
  token: string;
  /** OpenAI's discovery document: the keys and the revocation address come from it. */
  discovery: string;
  /** The API the token is for. Sent as `resource`, and the base of the model list. */
  api: string;
}

export const OPENAI: PlanEndpoints = {
  issuer: "https://auth.openai.com",
  authorize: "https://auth.openai.com/api/accounts/authorize",
  token: "https://auth.openai.com/api/accounts/oauth/token",
  discovery: "https://auth.openai.com/.well-known/openid-configuration",
  api: "https://api.openai.com/v1",
};

export const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
/** The scope that is plan use. A valid ID token without it is not permission. */
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const FIRST_CLIENT = "dynamic_agent_client";

export function endpointsOf(o?: Partial<PlanEndpoints>): PlanEndpoints {
  return { ...OPENAI, ...o };
}

export interface Answer {
  status: number;
  body: Record<string, unknown> | null;
}

/** No call to OpenAI waits longer than this, so a refresh never outlives the store's lock. */
const CALL_TIMEOUT_MS = 20_000;

async function send(url: string, init: RequestInit): Promise<Answer> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch {
    throw new OutletError(WORDS.unreachable, "plan_unreachable");
  }
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    /* an empty or non-JSON answer */
  }
  return { status: res.status, body };
}

export function postForm(url: string, params: Record<string, string>): Promise<Answer> {
  return send(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
}

export function getJson(url: string, headers: Record<string, string> = {}): Promise<Answer> {
  return send(url, { headers: { accept: "application/json", ...headers } });
}

/** OpenAI's error code from a token-endpoint answer ({"error": "invalid_grant"})
 *  or an API answer ({"error": {"code": "..."}}), cut to a safe short code. */
export function errorCode(body: Record<string, unknown> | null): string {
  const e = body?.error;
  if (e && typeof e === "object") return shortCode((e as { code?: unknown }).code);
  return shortCode(e);
}

/** The keys address and the revocation address, from OpenAI's discovery
 *  document. Both must sit on the issuer's own origin. */
export async function discover(ep: PlanEndpoints): Promise<{ jwks: string; revocation: string | null }> {
  const { status, body } = await getJson(ep.discovery);
  const origin = new URL(ep.issuer).origin;
  const onIssuer = (v: unknown): v is string => {
    if (typeof v !== "string") return false;
    try {
      return new URL(v).origin === origin;
    } catch {
      return false;
    }
  };
  if (status !== 200 || !body || body.issuer !== ep.issuer || !onIssuer(body.jwks_uri)) {
    fail(WORDS.idToken("issuer"), "plan_id_token");
  }
  return { jwks: body.jwks_uri, revocation: onIssuer(body.revocation_endpoint) ? body.revocation_endpoint : null };
}
