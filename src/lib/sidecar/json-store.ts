import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

const SIDECAR_BASE_DIR = process.env.SIDECAR_BASE_DIR?.trim() || process.cwd();

export function resolveSidecarPath(...segments: string[]): string {
  return join(SIDECAR_BASE_DIR, ...segments);
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
}

export async function readJsonFile<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFileAtomic(
  filePath: string,
  data: unknown,
): Promise<void> {
  await ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, "utf-8");
  await fs.rename(tempPath, filePath);
}
