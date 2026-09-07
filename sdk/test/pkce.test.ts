import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import Outlet, {
  createGrant,
  exchangeCode,
  handleRedirect,
  pkceChallenge,
} from "../src/index.js";

/** Reference S256 challenge, computed independently of the SDK. */
function expectedChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type Captured = [string, RequestInit];

/** Stub global fetch; return JSON `body` with `status`. Returns the mock so
 *  tests can assert on the captured URL / headers / body. */
function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastCall(fn: ReturnType<typeof mockFetch>): Captured {
  return fn.mock.calls[fn.mock.calls.length - 1] as unknown as Captured;
}

function stubSessionStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pkceChallenge()", () => {
  it("derives challenge = BASE64URL(SHA256(verifier)), method S256", async () => {
    const { verifier, challenge, method } = await pkceChallenge();
    expect(method).toBe("S256");
    expect(verifier).toHaveLength(43); // 32 random bytes, base64url unpadded
    expect(challenge).not.toMatch(/[+/=]/); // url-safe, unpadded
    expect(challenge).toBe(expectedChallenge(verifier));
  });

  it("is random per call", async () => {
    const a = await pkceChallenge();
    const b = await pkceChallenge();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

/** RFC 7636 Appendix B: the reference verifier, its 32 octets, and the
 *  S256 challenge the spec prints for it. */
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const RFC_BYTES = new Uint8Array(Buffer.from(RFC_VERIFIER, "base64url"));

/** A PkceCrypto whose "randomness" is `bytes` and whose hash is Node's own
 *  Web Crypto, so the SDK's derivation is what gets checked. */
function fixedCrypto(bytes: Uint8Array) {
  return {
    getRandomValues: vi.fn((buf: Uint8Array) => {
      buf.set(bytes.subarray(0, buf.length));
      return buf;
    }),
    sha256: vi.fn((data: Uint8Array) =>
      globalThis.crypto.subtle.digest("SHA-256", data),
    ),
  };
}

describe("pkceChallenge() with an injected PkceCrypto", () => {
  it("reproduces the RFC 7636 Appendix B vector", async () => {
    expect(RFC_BYTES).toHaveLength(32);
    const { verifier, challenge, method } = await pkceChallenge(
      fixedCrypto(RFC_BYTES),
    );
    expect(verifier).toBe(RFC_VERIFIER);
    expect(challenge).toBe(RFC_CHALLENGE);
    expect(method).toBe("S256");
  });

  it("rejects with no_crypto when the runtime has no Web Crypto", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(pkceChallenge()).rejects.toMatchObject({
      code: "no_crypto",
      message:
        "This runtime has no Web Crypto. Pass crypto: { getRandomValues, sha256 } to createGrant (React Native: expo-crypto).",
    });
  });
});

describe("createGrant()", () => {
  it("POSTs PKCE params with no secret, returns verifier+state", async () => {
    const fetchMock = mockFetch({
      grant_request_id: "gr_1",
      grant_url: "https://grant.useoutlet.dev/x",
    });
    const started = await createGrant({
      appId: "app_x",
      providers: ["anthropic"],
      redirectUri: "https://app.example/cb",
    });

    expect(started.grantRequestId).toBe("gr_1");
    expect(started.grantUrl).toBe("https://grant.useoutlet.dev/x");
    expect(started.verifier).toHaveLength(43);
    expect(started.state).toBeTruthy();

    const [url, init] = lastCall(fetchMock);
    expect(url).toMatch(/\/grants$/);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-outlet-app-secret"]).toBeUndefined();
    const sent = JSON.parse(init.body as string);
    expect(sent.code_challenge_method).toBe("S256");
    expect(sent.code_challenge).toBe(expectedChallenge(started.verifier));
    expect(sent.redirect_uri).toBe("https://app.example/cb");
    expect(sent.state).toBe(started.state);
  });

  it("requires a redirectUri", async () => {
    await expect(
      createGrant({ appId: "app_x", providers: ["anthropic"], redirectUri: "" }),
    ).rejects.toMatchObject({ code: "redirect_uri_required" });
  });

  it("forwards an injected crypto and keeps it off the wire", async () => {
    const fetchMock = mockFetch({
      grant_request_id: "gr_1",
      grant_url: "https://grant.useoutlet.dev/x",
    });
    const c = fixedCrypto(RFC_BYTES);
    const started = await createGrant({
      appId: "app_x",
      providers: ["anthropic"],
      redirectUri: "https://app.example/cb",
      crypto: c,
    });

    expect(c.sha256).toHaveBeenCalledTimes(1);
    expect(c.getRandomValues).toHaveBeenCalledTimes(2); // verifier, then state
    expect(started.verifier).toBe(RFC_VERIFIER);
    const [, init] = lastCall(fetchMock);
    const sent = JSON.parse(init.body as string);
    expect(sent.code_challenge).toBe(RFC_CHALLENGE);
    expect(sent).not.toHaveProperty("crypto");
    expect(init.body as string).not.toContain("crypto");
  });
});

describe("exchangeCode()", () => {
  it("POSTs code+verifier to /grants/token and maps refresh_token", async () => {
    const fetchMock = mockFetch({
      grantId: "g_1",
      keys: { anthropic: "sk-ant-api03-x" },
      capUsd: 5,
      expiresAt: "2026-07-01T00:00:00Z",
      refresh_token: "rt_abc",
    });
    const session = await exchangeCode({
      grantRequestId: "gr_1",
      code: "code_1",
      codeVerifier: "ver_1",
    });

    expect(session.grantId).toBe("g_1");
    expect(session.keys.anthropic).toBe("sk-ant-api03-x");
    expect(session.refreshToken).toBe("rt_abc");

    const [url, init] = lastCall(fetchMock);
    expect(url).toMatch(/\/grants\/token$/);
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({
      grant_request_id: "gr_1",
      code: "code_1",
      code_verifier: "ver_1",
    });
    const headers = init.headers as Record<string, string>;
    expect(headers["x-outlet-app-secret"]).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });
});

describe("public-client grant ops carry the refresh token", () => {
  it("refresh() sends Authorization: Bearer, not the app secret", async () => {
    const fetchMock = mockFetch({
      grantId: "g_1",
      keys: {},
      capUsd: 5,
      expiresAt: "2026-07-01T00:00:00Z",
    });
    await Outlet.refresh("g_1", { refreshToken: "rt_abc" });
    const [, init] = lastCall(fetchMock);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer rt_abc");
    expect(headers["x-outlet-app-secret"]).toBeUndefined();
  });
});

describe("handleRedirect()", () => {
  it("verifies state, exchanges the code, clears the transaction", async () => {
    const store = stubSessionStorage({
      "outlet:pkce": JSON.stringify({
        grantRequestId: "gr_1",
        verifier: "ver_1",
        state: "st_1",
      }),
    });
    const fetchMock = mockFetch({
      grantId: "g_1",
      keys: { anthropic: "sk-ant-api03-x" },
      capUsd: 5,
      expiresAt: "2026-07-01T00:00:00Z",
      refresh_token: "rt_1",
    });

    const session = await handleRedirect({
      url: "https://app.example/cb?code=code_1&state=st_1",
    });
    expect(session.refreshToken).toBe("rt_1");

    const [, init] = lastCall(fetchMock);
    const sent = JSON.parse(init.body as string);
    expect(sent.code).toBe("code_1");
    expect(sent.code_verifier).toBe("ver_1");
    expect(store.has("outlet:pkce")).toBe(false);
  });

  it("rejects a state mismatch (CSRF guard) and never exchanges", async () => {
    stubSessionStorage({
      "outlet:pkce": JSON.stringify({
        grantRequestId: "gr_1",
        verifier: "ver_1",
        state: "st_1",
      }),
    });
    const fetchMock = mockFetch({});
    await expect(
      handleRedirect({ url: "https://app.example/cb?code=code_1&state=WRONG" }),
    ).rejects.toMatchObject({ code: "state_mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("errors when no transaction is in progress", async () => {
    stubSessionStorage({});
    await expect(
      handleRedirect({ url: "https://app.example/cb?code=c&state=s" }),
    ).rejects.toMatchObject({ code: "no_pkce_txn" });
  });
});
