/** What a screen knows about one provider: its registry entry, or the name
 *  and keys page the app supplied for a provider outside the registry. */
import { type ProviderEntry, getProvider } from "../providers.js";
import type { Config } from "./routes.js";

export interface ScreenProvider {
  id: string;
  /** The display name every screen shows. */
  name: string;
  /** Null when the app described a provider and gave no keys page. */
  keysUrl: string | null;
  /** The registry entry behind a named Direct screen, or null for the
   *  generic one. */
  entry: ProviderEntry | null;
}

export function screenProvider(cfg: Config, id: string): ScreenProvider {
  const entry = getProvider(id) ?? null;
  if (entry) return { id, name: entry.displayName, keysUrl: entry.keysUrl, entry };
  const described = cfg.custom?.[id];
  return { id, name: described?.name ?? id, keysUrl: described?.keysUrl ?? null, entry: null };
}

/** Fill {provider} and {other} in a strings.ts line with display names. */
export function fill(text: string, provider?: string, other?: string): string {
  return text
    .replace(/\{provider\}/g, provider ?? "")
    .replace(/\{other\}/g, other ?? "");
}
