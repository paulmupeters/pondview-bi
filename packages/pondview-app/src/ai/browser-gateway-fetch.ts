export function sanitizeGatewayBrowserHeaders(headers?: HeadersInit): Headers {
  const sanitizedHeaders = new Headers(headers);
  sanitizedHeaders.delete("user-agent");
  return sanitizedHeaders;
}

type BrowserFetchFunction = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export function createBrowserGatewayFetch(
  baseFetch: BrowserFetchFunction = globalThis.fetch,
): typeof fetch {
  const wrappedFetch = (async (input, init) => {
    const sanitizedHeaders = sanitizeGatewayBrowserHeaders(init?.headers);
    const nextInit = init
      ? { ...init, headers: sanitizedHeaders }
      : { headers: sanitizedHeaders };

    return baseFetch(input, nextInit);
  }) as typeof fetch;

  const preconnectFromBaseFetch =
    "preconnect" in baseFetch &&
    typeof (baseFetch as { preconnect?: unknown }).preconnect === "function"
      ? (baseFetch as typeof fetch).preconnect.bind(baseFetch as typeof fetch)
      : undefined;
  const preconnectFallback: typeof fetch.preconnect = () => {};
  const preconnect = preconnectFromBaseFetch ?? preconnectFallback;

  wrappedFetch.preconnect = preconnect;
  return wrappedFetch;
}
