import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredFileSuffixes = [".test.ts", ".test.tsx", ".d.ts"];
const entryFiles = new Set([path.join(srcDir, "vite", "main.tsx")]);

const projectFiles = [];

function getTrackedSourceFiles() {
  const output = execFileSync("git", ["ls-files", "--", "src"], {
    cwd: root,
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => path.join(root, file));
}

function shouldTrackFile(name) {
  if (!sourceExtensions.has(path.extname(name))) {
    return false;
  }

  return !ignoredFileSuffixes.some((suffix) => name.endsWith(suffix));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (shouldTrackFile(entry.name)) {
      projectFiles.push(path.normalize(fullPath));
    }
  }
}

function resolveImport(fromFile, specifier, knownFiles) {
  let basePath;

  if (specifier.startsWith("@/")) {
    basePath = path.join(srcDir, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    basePath,
    ...Array.from(sourceExtensions, (ext) => `${basePath}${ext}`),
    ...Array.from(sourceExtensions, (ext) =>
      path.join(basePath, `index${ext}`),
    ),
  ];

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (knownFiles.has(normalized)) {
      return normalized;
    }
  }

  return null;
}

const trackedSourceFiles = new Set(
  getTrackedSourceFiles().map((file) => path.normalize(file)),
);

walk(srcDir);

const trackedProjectFiles = projectFiles.filter((file) =>
  trackedSourceFiles.has(file),
);

const knownFiles = new Set(trackedProjectFiles);
const inboundReferences = new Map(
  trackedProjectFiles.map((file) => [file, new Set()]),
);
const importPattern =
  /(?:import|export)\s+(?:[^'"`]+?from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

for (const file of trackedProjectFiles) {
  const source = fs.readFileSync(file, "utf8");

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    const resolved = resolveImport(file, specifier, knownFiles);
    if (!resolved) {
      continue;
    }

    inboundReferences.get(resolved)?.add(file);
  }
}

const deadFiles = trackedProjectFiles
  .filter(
    (file) => !entryFiles.has(file) && inboundReferences.get(file)?.size === 0,
  )
  .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
  .sort();

if (deadFiles.length === 0) {
  process.exit(0);
}

console.error("Dead source files detected:");
for (const file of deadFiles) {
  console.error(`- ${file}`);
}

process.exit(1);

