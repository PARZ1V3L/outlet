/** A made-up key of the shape a registry entry documents. Never a real key. */
import type { ProviderEntry } from "../src/index.js";

const FILL = "abc123def456ghi789jkl012mno345pqr678stu901";

export function sampleKey(p: ProviderEntry): string {
  const shape = p.keyShape;
  if (shape?.prefix) {
    const body = shape.length ? shape.length - shape.prefix.length : 24;
    return shape.prefix + FILL.slice(0, body);
  }
  if (shape?.separator) return `keyid123${shape.separator}secret456`;
  return "opaque-token-xyz-123456";
}
