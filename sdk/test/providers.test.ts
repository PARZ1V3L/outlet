import { describe, expect, it } from "vitest";
import Outlet from "../src/index.js";

describe("direct() with OpenAI-compatible providers", () => {
  it("accepts a named OpenAI-compatible provider key (Groq)", async () => {
    const s = await Outlet.direct({ keys: { groq: "gsk_abc123def456ghi789jkl" } });
    expect(s.keys.groq).toBe("gsk_abc123def456ghi789jkl");
    expect(s.mode).toBe("direct");
  });

  it("accepts an arbitrary provider not in the named list (open ecosystem)", async () => {
    const s = await Outlet.direct({ keys: { someprovider: "opaque-token-xyz-123456" } });
    expect(s.keys.someprovider).toBe("opaque-token-xyz-123456");
  });

  it("does NOT false-flag a DeepSeek key (generic sk-) as an OpenAI key", async () => {
    const s = await Outlet.direct({ keys: { deepseek: "sk-deepseek1234567890abcdef" } });
    expect(s.keys.deepseek).toBe("sk-deepseek1234567890abcdef");
  });

  it("still refuses an admin key for ANY provider", async () => {
    await expect(
      Outlet.direct({ keys: { groq: "sk-admin-danger123" } }),
    ).rejects.toMatchObject({ code: "admin_key_rejected" });
  });

  it("still catches a distinctive mix-up (Anthropic key in a Groq field)", async () => {
    await expect(
      Outlet.direct({ keys: { groq: "sk-ant-api03-whatever" } }),
    ).rejects.toMatchObject({ code: "wrong_provider_key" });
  });

  it("rejects an empty key for an OpenAI-compatible provider", async () => {
    await expect(
      Outlet.direct({ keys: { groq: "   " } }),
    ).rejects.toMatchObject({ code: "invalid_key_format" });
  });
});
