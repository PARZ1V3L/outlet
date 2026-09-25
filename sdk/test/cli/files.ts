/** Repo files as the CLI tests read them, from the repository root. */
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
export const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

/** The first fenced text block after a heading in a markdown file. */
export function promptBlock(markdown: string, heading: string): string | undefined {
  const at = markdown.indexOf(heading);
  if (at < 0) return undefined;
  return markdown.slice(at).match(/^```text\n([\s\S]*?)^```$/m)?.[1];
}
