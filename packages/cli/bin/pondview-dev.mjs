#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(binDir, "../src/cli-entry.ts");

const child = spawn("bun", ["run", cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(
      "Unable to run pondview from source because Bun was not found.",
    );
    console.error("Install Bun or run the packaged pondview CLI instead.");
    process.exit(127);
  }

  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
