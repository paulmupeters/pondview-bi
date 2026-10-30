// Builds every MCP App view as its own single-file HTML. vite-plugin-singlefile
// cannot span multiple entries, so each view gets a separate `vite build` with
// VIEW=<name> (see vite.config.ts). Extra CLI args (e.g. --outDir) pass through.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const VIEWS = ["visual", "dashboard"];

const require = createRequire(import.meta.url);
const viteBin = path.join(
  path.dirname(require.resolve("vite/package.json")),
  "bin",
  "vite.js",
);
const args = process.argv.slice(2);

for (const view of VIEWS) {
  const result = spawnSync(process.execPath, [viteBin, "build", ...args], {
    stdio: "inherit",
    env: { ...process.env, VIEW: view },
  });
  if (result.status !== 0) {
    console.error(`Building the ${view} view failed.`);
    process.exit(result.status ?? 1);
  }
}
