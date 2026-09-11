/** What a pasted key looks like, judged the way the core's direct() judges
 *  it, so the sheet can name the provider a key belongs to. The key itself
 *  never leaves the call. */
import type { UiProvider } from "./types.js";

/** The core's own cleaning: clipboard whitespace and config-file quotes. */
export function clean(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "");
}

/** The provider a key's prefix belongs to, or null when nothing is
 *  distinctive. Order matters: "sk-ant-" before the generic "sk-". */
export function sniffProvider(raw: string): UiProvider | null {
  const key = clean(raw);
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-")) return "openai";
  return null;
}
