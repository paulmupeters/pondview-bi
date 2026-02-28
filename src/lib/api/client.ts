const DEFAULT_TIMEOUT_MS = 30_000;

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path;
}

function createTimeoutSignal(
  timeoutMs: number,
  signal?: AbortSignal | null,
): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const cleanup = () => clearTimeout(timeoutId);
  controller.signal.addEventListener("abort", cleanup, { once: true });

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  return controller.signal;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const url = resolveApiUrl(path);
  const response = await fetch(url, {
    ...init,
    signal: createTimeoutSignal(timeoutMs, init.signal),
  });
  return response;
}

export async function apiFetchJson<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const response = await apiFetch(path, init, timeoutMs);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `API ${response.status} ${response.statusText}: ${errorText || path}`,
    );
  }
  return (await response.json()) as T;
}
