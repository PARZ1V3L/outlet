import { describe, expect, it } from "vitest";
import Outlet, { OutletError, direct } from "../src/index.js";

const OPENAI_KEY = "sk-proj-abc123def456";
const ANTHROPIC_KEY = "sk-ant-api03-abc123";
const GOOGLE_KEY = "AIzaSyExample123";

async function errorOf(p: Promise<unknown>): Promise<OutletError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OutletError);
    return e as OutletError;
  }
  throw new Error("expected rejection, got success");
}

describe("direct() — happy path", () => {
  it("accepts valid keys for all providers and returns a session", async () => {
    const session = await direct({
      keys: { openai: OPENAI_KEY, anthropic: ANTHROPIC_KEY, google: GOOGLE_KEY },
    });
    expect(session.keys.openai).toBe(OPENAI_KEY);
    expect(session.keys.anthropic).toBe(ANTHROPIC_KEY);
    expect(session.keys.google).toBe(GOOGLE_KEY);
    expect(session.grantId).toMatch(/^direct_/);
    expect(session.mode).toBe("direct");
    expect(session.capUsd).toBe(Number.POSITIVE_INFINITY);
  });

  it("accepts legacy and service-account OpenAI prefixes", async () => {
    for (const key of ["sk-abc123legacy", "sk-svcacct-abc123"]) {
      const s = await direct({ keys: { openai: key } });
      expect(s.keys.openai).toBe(key);
    }
  });

  it("cleans clipboard noise: whitespace and quotes", async () => {
    const s = await direct({ keys: { openai: `  "${OPENAI_KEY}" \n` } });
    expect(s.keys.openai).toBe(OPENAI_KEY);
  });

  it("is exposed on the default export", async () => {
    const s = await Outlet.direct({ keys: { openai: OPENAI_KEY } });
    expect(s.mode).toBe("direct");
  });
});

describe("direct() — admin keys are always refused", () => {
  it("rejects an Anthropic admin key even in the anthropic field", async () => {
    const err = await errorOf(direct({ keys: { anthropic: "sk-ant-admin01-xyz" } }));
    expect(err.code).toBe("admin_key_rejected");
    expect(err.message).toMatch(/ADMIN/);
  });

  it("rejects an OpenAI admin key even in the openai field", async () => {
    const err = await errorOf(direct({ keys: { openai: "sk-admin-xyz" } }));
    expect(err.code).toBe("admin_key_rejected");
  });

  it("rejects admin keys pasted into the WRONG field too", async () => {
    const err = await errorOf(direct({ keys: { openai: "sk-ant-admin01-xyz" } }));
    expect(err.code).toBe("admin_key_rejected");
  });
});

describe("direct() — provider mix-ups get specific hints", () => {
  it("anthropic key pasted as openai", async () => {
    const err = await errorOf(direct({ keys: { openai: ANTHROPIC_KEY } }));
    expect(err.code).toBe("wrong_provider_key");
    expect(err.message).toMatch(/ANTHROPIC/);
  });

  it("openai key pasted as anthropic", async () => {
    const err = await errorOf(direct({ keys: { anthropic: OPENAI_KEY } }));
    expect(err.code).toBe("wrong_provider_key");
    expect(err.message).toMatch(/OPENAI/);
  });

  it("google key pasted as openai", async () => {
    const err = await errorOf(direct({ keys: { openai: GOOGLE_KEY } }));
    expect(err.code).toBe("wrong_provider_key");
    expect(err.message).toMatch(/GOOGLE/);
  });

  it("openai key pasted as google", async () => {
    const err = await errorOf(direct({ keys: { google: OPENAI_KEY } }));
    expect(err.code).toBe("wrong_provider_key");
  });
});

describe("direct() — format and input errors", () => {
  it("rejects an empty keys object", async () => {
    const err = await errorOf(direct({ keys: {} }));
    expect(err.code).toBe("no_keys");
  });

  it("rejects empty/garbage keys", async () => {
    expect((await errorOf(direct({ keys: { openai: "   " } }))).code)
      .toBe("invalid_key_format");
    expect((await errorOf(direct({ keys: { anthropic: "not-a-key" } }))).code)
      .toBe("invalid_key_format");
  });
});

describe("vault operations on direct sessions fail with directions", () => {
  it.each(["refresh", "status", "revoke"] as const)("%s()", async (fn) => {
    const session = await direct({ keys: { openai: OPENAI_KEY } });
    const err = await errorOf(Outlet[fn](session.grantId));
    expect(err.code).toBe("direct_mode_session");
    expect(err.message).toMatch(/provider's website/);
  });
});
