/**
 * A fake OpenAI on 127.0.0.1 for the plan tests: the sign-in redirect, the
 * token endpoint, the published keys, the revocation endpoint, the model
 * list and the Responses answers. No test in this folder leaves the loopback.
 */
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { PlanEndpoints } from "../../src/plan/index.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: strangerKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "fake-key-1";
const PLAN = "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke";

export type IdTokenFault = "signature" | "issuer" | "audience" | "expiry" | "nonce" | "alg" | "kid";

export interface Fake {
  endpoints: PlanEndpoints;
  origin: string;
  /** Every request the fake received, in order. */
  requests: { method: string; path: string; query: URLSearchParams; form: URLSearchParams; headers: IncomingMessage["headers"] }[];
  /** Every token the fake ever issued, for "no token in an error or a log". */
  issued: string[];
  /** How the next authorize answers. */
  authorize: "approve" | "deny" | "wrong_state" | "no_client" | "other_client" | "no_code";
  /** What is wrong with the next ID token, if anything. */
  idTokenFault: IdTokenFault | null;
  /** The scope the next token answer grants. */
  scope: string;
  /** Make the next token calls fail: { status, body }. */
  tokenFailure: { status: number; body: unknown } | null;
  refreshFailure: { status: number; body: unknown } | null;
  revokeStatus: number;
  /** The next answer of /v1/responses and /v1/models. */
  responses: { status: number; body: unknown };
  models: { status: number; body: unknown };
  sub: string;
  email: string;
  expiresIn: number;
  count(path: string): number;
  close(): Promise<void>;
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

function jwt(claims: Record<string, unknown>, fault: IdTokenFault | null): string {
  const header = { alg: fault === "alg" ? "HS256" : "RS256", kid: fault === "kid" ? "some-other-key" : KID, typ: "JWT" };
  const signed = `${b64(header)}.${b64(claims)}`;
  const signature = createSign("RSA-SHA256").update(signed).sign(fault === "signature" ? strangerKey : privateKey);
  return `${signed}.${signature.toString("base64url")}`;
}

function read(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => resolve(body));
  });
}

export async function fakeOpenAI(): Promise<Fake> {
  const codes = new Map<string, { challenge: string; nonce: string; clientId: string; redirectUri: string }>();
  const refreshTokens = new Map<string, string>(); // token -> client id
  const spent = new Set<string>();
  let server: Server;
  const mint = (prefix: string) => {
    const t = `${prefix}_${randomBytes(18).toString("base64url")}`;
    fake.issued.push(t);
    return t;
  };

  const tokenAnswer = (clientId: string, nonce: string | undefined) => {
    const now = Math.floor(Date.now() / 1000);
    const fault = fake.idTokenFault;
    const idToken = jwt({
      iss: fault === "issuer" ? "https://auth.example.com" : fake.endpoints.issuer,
      aud: fault === "audience" ? ["oaiapp_someone_else"] : [clientId],
      sub: fake.sub,
      email: fake.email,
      iat: now,
      exp: fault === "expiry" ? now - 600 : now + 3600,
      ...(nonce === undefined ? {} : { nonce: fault === "nonce" ? "another-attempt" : nonce }),
    }, fault);
    fake.issued.push(idToken);
    const refresh = mint("rt");
    refreshTokens.set(refresh, clientId);
    return {
      access_token: mint("at"),
      refresh_token: refresh,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: fake.expiresIn,
      scope: fake.scope,
      earliest_refresh_at: now + fake.expiresIn - 360,
    };
  };

  const fake: Fake = {
    endpoints: { issuer: "", authorize: "", token: "", discovery: "", api: "" },
    origin: "",
    requests: [],
    issued: [],
    authorize: "approve",
    idTokenFault: null,
    scope: PLAN,
    tokenFailure: null,
    refreshFailure: null,
    revokeStatus: 200,
    responses: { status: 200, body: { ok: true } },
    models: {
      status: 200,
      body: { models: [
        { slug: "gpt-big", display_name: "GPT Big", description: "The large one.", visibility: "list" },
        { slug: "gpt-hidden", display_name: "Hidden", visibility: "hide" },
        { slug: "gpt-small", display_name: "GPT Small", visibility: "list" },
      ] },
    },
    sub: "user-sub-1",
    email: "user@example.com",
    expiresIn: 3600,
    count: (path) => fake.requests.filter((r) => r.path === path).length,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };

  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", fake.origin);
    const raw = req.method === "POST" ? await read(req) : "";
    const form = new URLSearchParams(req.headers["content-type"]?.includes("x-www-form-urlencoded") ? raw : "");
    fake.requests.push({ method: req.method ?? "", path: url.pathname, query: url.searchParams, form, headers: req.headers });
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const q = url.searchParams;

    if (url.pathname === "/.well-known/openid-configuration") {
      return json(200, { issuer: fake.endpoints.issuer, jwks_uri: `${fake.origin}/jwks`, revocation_endpoint: `${fake.origin}/revoke` });
    }
    if (url.pathname === "/jwks") {
      return json(200, { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] });
    }
    if (url.pathname === "/authorize") {
      const back = new URL(q.get("redirect_uri") ?? "");
      const first = q.get("client_id") === "dynamic_agent_client";
      const clientId = fake.authorize === "other_client" ? "oaiapp_other" : first ? `oaiapp_${randomBytes(6).toString("hex")}` : (q.get("client_id") as string);
      if (fake.authorize === "deny") back.searchParams.set("error", "access_denied");
      else if (fake.authorize !== "no_code") {
        const code = mint("code");
        codes.set(code, { challenge: q.get("code_challenge") ?? "", nonce: q.get("nonce") ?? "", clientId, redirectUri: back.toString() });
        back.searchParams.set("code", code);
        back.searchParams.set("scope", fake.scope);
      }
      back.searchParams.set("state", fake.authorize === "wrong_state" ? "someone-elses-state" : (q.get("state") ?? ""));
      if ((first && fake.authorize !== "no_client") || fake.authorize === "other_client") back.searchParams.set("client_id", clientId);
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/token") {
      if (form.get("grant_type") === "authorization_code") {
        if (fake.tokenFailure) return json(fake.tokenFailure.status, fake.tokenFailure.body);
        const code = codes.get(form.get("code") ?? "");
        const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
        if (!code || code.challenge !== challenge || code.clientId !== form.get("client_id") || code.redirectUri !== form.get("redirect_uri")) {
          return json(400, { error: "invalid_grant" });
        }
        codes.delete(form.get("code") ?? "");
        return json(200, tokenAnswer(code.clientId, code.nonce));
      }
      if (form.get("grant_type") === "refresh_token") {
        if (fake.refreshFailure) return json(fake.refreshFailure.status, fake.refreshFailure.body);
        const presented = form.get("refresh_token") ?? "";
        if (spent.has(presented)) return json(400, { error: "refresh_token_reused" });
        const clientId = refreshTokens.get(presented);
        if (!clientId || clientId !== form.get("client_id")) return json(400, { error: "invalid_grant" });
        refreshTokens.delete(presented);
        spent.add(presented);
        return json(200, tokenAnswer(clientId, undefined));
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (url.pathname === "/revoke") return json(fake.revokeStatus, undefined);
    if (url.pathname === "/v1/models") return json(fake.models.status, fake.models.body);
    if (url.pathname === "/v1/responses") return json(fake.responses.status, fake.responses.body);
    return json(404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  fake.origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  fake.endpoints = {
    issuer: fake.origin,
    authorize: `${fake.origin}/authorize`,
    token: `${fake.origin}/token`,
    discovery: `${fake.origin}/.well-known/openid-configuration`,
    api: `${fake.origin}/v1`,
  };
  return fake;
}

/** What a browser does with the sign-in address: follow OpenAI's redirect
 *  to the loopback callback and show the page that comes back. */
export async function visit(url: string): Promise<{ status: number; page: string; callback: string }> {
  const first = await fetch(url, { redirect: "manual" });
  const callback = first.headers.get("location") ?? "";
  const landed = await fetch(callback);
  return { status: landed.status, page: await landed.text(), callback };
}
