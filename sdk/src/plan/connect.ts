/**
 * The sign-in, step by step as OpenAI's page gives it
 * (developers.openai.com/siwc/token-sharing-open-source/sign-in): the host
 * id kept before the first sign-in, a fresh state, nonce and PKCE verifier
 * per attempt, the browser, one callback on 127.0.0.1, the code exchange,
 * the ID token verified, plan use checked in the granted scopes, then the
 * record saved. Every call here goes to OpenAI. None goes to Outlet.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { OutletError } from "../types.js";
import {
  FIRST_CLIENT, PLAN_SCOPE, type PlanEndpoints, SCOPES, endpointsOf, errorCode, postForm,
} from "./endpoints.js";
import { verifyIdToken } from "./idtoken.js";
import { listen } from "./listener.js";
import { type PlanSession, localId, toSession, withTokens } from "./session.js";
import { type PlanRecord, type PlanStore, planFileStore } from "./store.js";
import { WORDS, fail, shortCode } from "./words.js";

export interface PlanOptions {
  /** OpenAI is the one provider with this way in. */
  provider: "openai";
  /** Your app's name. OpenAI shows it to the user on the approval screen. */
  appName: string;
  /** Where the sign-in is kept. Default: a file in the user's config folder. */
  store?: PlanStore;
  /** For tests. Defaults to OpenAI's addresses. */
  endpoints?: Partial<PlanEndpoints>;
}

export interface ConnectPlanOptions extends PlanOptions {
  /** Show the sign-in address to the user. Default: open the system
   *  browser. The address can carry an ID token as a hint: never log it. */
  open?: (url: string) => void | Promise<void>;
  /** The loopback port to listen on. Default: 1455, or any free port when
   *  1455 is taken. */
  port?: number;
  /** Cancel a sign-in that is waiting for the browser. */
  signal?: AbortSignal;
  /** How long to wait for the browser. Default: five minutes. */
  timeoutMs?: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;

export function checked<T extends PlanOptions>(o: T): T {
  if (!o || o.provider !== "openai") fail(WORDS.provider, "plan_provider");
  if (typeof o.appName !== "string" || o.appName.trim() === "") fail(WORDS.appName, "plan_app_name");
  return o;
}

const fresh = () => randomBytes(32).toString("base64url");

function same(a: string | null, b: string): boolean {
  if (typeof a !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The system browser, with no shell in between. */
function openBrowser(url: string): Promise<void> {
  const [command, args]: [string, string[]] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : ["xdg-open", [url]];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", () => reject(new OutletError(WORDS.open, "plan_open_failed")));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * Run OpenAI's sign-in in the user's browser and return a session. The first
 * call registers this install under `appName` and the user approves it once.
 * Later calls reuse that registration. One account per app in this version.
 */
export async function connectPlan(o: ConnectPlanOptions): Promise<PlanSession> {
  const { appName } = checked(o);
  const ep = endpointsOf(o.endpoints);
  const store = o.store ?? planFileStore(appName);

  // The host id is made and kept before the first sign-in, then reused.
  const saved = await store.load();
  let record: PlanRecord = saved ?? { provider: "openai", appName, hostId: `urn:uuid:${randomUUID()}` };
  if (!saved) await store.save(record);

  const state = fresh();
  const nonce = fresh();
  const verifier = fresh();
  const listener = await listen({ port: o.port, timeoutMs: o.timeoutMs ?? FIVE_MINUTES, signal: o.signal });
  try {
    const first = !record.clientId;
    const url = new URL(ep.authorize);
    url.search = new URLSearchParams({
      client_id: record.clientId ?? FIRST_CLIENT,
      // The name goes only with a first registration. A saved account's hints go only with a return.
      ...(first ? { agent_name_hint: appName } : {}),
      ext_agent_host_id: record.hostId,
      ...(!first && record.idToken ? { id_token_hint: record.idToken } : {}),
      ...(!first && record.email ? { login_hint: record.email } : {}),
      response_type: "code",
      redirect_uri: listener.redirectUri,
      scope: SCOPES,
      resource: ep.api,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    await (o.open ?? openBrowser)(url.toString());

    const callback = await listener.callback;
    try {
      const session = await finish(callback.query, { record, first, state, nonce, verifier, ep, store, redirectUri: listener.redirectUri });
      callback.finish(true);
      return session;
    } catch (e) {
      callback.finish(false);
      throw e;
    }
  } finally {
    listener.close();
  }
}

async function finish(
  q: URLSearchParams,
  a: {
    record: PlanRecord; first: boolean; state: string; nonce: string; verifier: string;
    ep: PlanEndpoints; store: PlanStore; redirectUri: string;
  },
): Promise<PlanSession> {
  // The state first. A callback that does not carry this attempt's ends the attempt.
  if (!same(q.get("state"), a.state)) fail(WORDS.stateMismatch, "state_mismatch");
  const oauthError = q.get("error");
  if (oauthError === "access_denied") fail(WORDS.declined, "plan_declined");
  if (oauthError) fail(WORDS.notFinished(shortCode(oauthError)), "plan_sign_in_failed");
  const code = q.get("code");
  if (!code) fail(WORDS.notFinished("no_code"), "plan_sign_in_failed");

  let record = a.record;
  const issued = q.get("client_id");
  if (a.first) {
    // A first registration must come back with the client id OpenAI issued.
    if (!issued || issued === FIRST_CLIENT) fail(WORDS.notFinished("registration_incomplete"), "plan_sign_in_failed");
    record = { ...record, clientId: issued };
    // Kept before the exchange: if the code has expired, the next attempt reuses the registration.
    await a.store.save(record);
  } else if (issued && issued !== record.clientId) {
    fail(WORDS.notFinished("client_mismatch"), "plan_sign_in_failed");
  }
  const clientId = record.clientId as string;

  const answer = await postForm(a.ep.token, {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: a.verifier,
    redirect_uri: a.redirectUri,
    resource: a.ep.api,
  });
  const tok = answer.body;
  if (answer.status !== 200 || !tok || typeof tok.access_token !== "string") {
    fail(WORDS.notFinished(errorCode(tok)), "plan_sign_in_failed", answer.status);
  }

  const identity = await verifyIdToken(tok.id_token, { clientId, nonce: a.nonce, endpoints: a.ep });
  // A return to a saved account must be that account, before anything is replaced.
  if (record.subject && record.subject !== identity.sub) fail(WORDS.otherAccount, "plan_other_account");

  // A valid ID token alone is not plan permission: the granted scopes decide.
  const next = withTokens(record, tok);
  if (!next.scopes?.includes(PLAN_SCOPE)) fail(WORDS.notGranted, "plan_use_not_granted");

  const full: PlanRecord = {
    ...next,
    grantId: localId(),
    issuer: a.ep.issuer,
    subject: identity.sub,
    ...(identity.email ? { email: identity.email } : {}),
  };
  await a.store.save(full);
  return toSession(full) as PlanSession;
}
