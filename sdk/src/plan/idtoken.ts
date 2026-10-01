/**
 * The ID token, verified: signature against OpenAI's published keys, issuer,
 * audience, expiry and the nonce of this attempt. Built on node:crypto, no
 * dependency. The algorithm is pinned to RS256, the only one OpenAI's
 * discovery document lists. A token that fails any check is never saved, and
 * no error names more than the check that failed.
 */
import { createPublicKey, verify } from "node:crypto";
import { type PlanEndpoints, discover, getJson } from "./endpoints.js";
import { WORDS, fail } from "./words.js";

export interface Identity {
  sub: string;
  email?: string;
}

/** Seconds of clock difference allowed on the expiry check. */
const LEEWAY = 5;

function refuse(check: string): never {
  fail(WORDS.idToken(check), "plan_id_token");
}

function part(segment: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment ?? "", "base64url").toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* refused below */
  }
  return refuse("format");
}

export async function verifyIdToken(
  idToken: unknown,
  want: { clientId: string; nonce: string; endpoints: PlanEndpoints },
): Promise<Identity> {
  if (typeof idToken !== "string") refuse("format");
  const segments = idToken.split(".");
  if (segments.length !== 3) refuse("format");
  const [h, p, s] = segments;
  const header = part(h);
  const claims = part(p);

  if (header.alg !== "RS256" || typeof header.kid !== "string") refuse("signature");
  const { jwks } = await discover(want.endpoints);
  const published = await getJson(jwks);
  const keys = Array.isArray(published.body?.keys) ? (published.body.keys as Record<string, unknown>[]) : [];
  const jwk = keys.find(
    (k) => k && k.kid === header.kid && k.kty === "RSA" && (k.use === undefined || k.use === "sig")
      && (k.alg === undefined || k.alg === "RS256"),
  );
  if (!jwk) refuse("signature");
  let good = false;
  try {
    good = verify(
      "RSA-SHA256",
      Buffer.from(`${h}.${p}`),
      createPublicKey({ key: jwk as never, format: "jwk" }),
      Buffer.from(s ?? "", "base64url"),
    );
  } catch {
    good = false;
  }
  if (!good) refuse("signature");

  if (claims.iss !== want.endpoints.issuer) refuse("issuer");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(want.clientId)) refuse("audience");
  if (typeof claims.exp !== "number" || claims.exp + LEEWAY < Date.now() / 1000) refuse("expiry");
  if (typeof claims.nonce !== "string" || claims.nonce !== want.nonce) refuse("nonce");
  if (typeof claims.sub !== "string" || claims.sub === "") refuse("subject");

  return { sub: claims.sub, ...(typeof claims.email === "string" ? { email: claims.email } : {}) };
}
