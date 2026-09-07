/** Shared vault transport (SPEC §7). Auth-header handling lives here so the
 *  confidential (app_secret) and public (PKCE bearer) paths can't drift. */
import { OutletError } from "./types.js";

export const DEFAULT_BASE_URL = "https://api.useoutlet.dev/v0";

/** Codes the vault speaks to the DEVELOPER rather than to the user
 *  (SPEC §6.2). The wire carries the code; the words live here so the
 *  message reads right in a stack trace. Wording: Parz's word pass. */
const DEVELOPER_MESSAGES: Record<string, string> = {
  // The blessed line (PRICING-MODEL, SPEC §6.2): billing never reaches a
  // user, and existing connections keep working through a lapse.
  vault_requires_billing:
    "Add a payment method to enable vault mode for this app. Existing connections keep working.",
};

/** How a request proves itself to the vault. Confidential clients send the
 *  app secret; public clients send a grant-scoped refresh token as Bearer
 *  (SPEC §6.1, §7.1). The PKCE code exchange sends neither — the code and
 *  verifier in its body are the proof. */
export interface Auth {
  appSecret?: string;
  bearer?: string;
}

export async function api<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  auth?: Auth,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(auth?.appSecret ? { "x-outlet-app-secret": auth.appSecret } : {}),
        ...(auth?.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // A network-level failure means the host is unreachable. Surface a clear,
    // on-brand error with a door, not a raw "fetch failed".
    throw new OutletError(
      `Couldn't reach the Outlet vault at ${baseUrl}. Try again in a moment; ` +
        `if it keeps failing, email hello@useoutlet.dev.`,
      "vault_unavailable",
    );
  }
  if (!res.ok) {
    let code = "request_failed";
    try {
      code = ((await res.json()) as { code?: string }).code ?? code;
    } catch {
      /* non-JSON error body */
    }
    throw new OutletError(
      DEVELOPER_MESSAGES[code] ?? `Outlet API error (${res.status})`, code, res.status);
  }
  return res.json() as Promise<T>;
}
