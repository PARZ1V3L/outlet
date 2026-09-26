// Writes the provider registry as providers.json: into the package (dist/),
// into the repo's docs/, where the provider support page is built from it,
// and into the Python package (sdk-python/), which ships the same rows. Runs
// after tsc in `npm run build`. The registry is the one source.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { providers } from "../dist/providers.js";

const json = JSON.stringify({ providers }, null, 2) + "\n";
for (const target of ["../dist/providers.json", "../../docs/providers.json", "../../sdk-python/src/useoutlet/providers.json"]) {
  const path = fileURLToPath(new URL(target, import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json);
  console.log("wrote", path.replace(/^.*\/(sdk|docs|sdk-python)\//, "$1/"));
}
