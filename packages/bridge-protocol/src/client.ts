import {
  type BridgeAttachSourceRequest,
  type BridgeCapabilitiesResponse,
  type BridgeCatalogResponse,
  type BridgeHealthResponse,
  type BridgeQueryRequest,
  type BridgeQueryResponse,
  type BridgeSourcesResponse,
  bridgeCapabilitiesResponseSchema,
  bridgeCatalogResponseSchema,
  bridgeErrorResponseSchema,
  bridgeHealthResponseSchema,
  bridgeQueryResponseSchema,
  bridgeSourcesResponseSchema,
} from "./schemas";

export interface BridgeClientOptions {
  baseUrl?: string;
  token?: string;
  fetch?: typeof fetch;
}

export class BridgeClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | undefined;

  constructor(options: BridgeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:17817").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = options.fetch ?? fetch;
    this.token = options.token;
  }

  health(): Promise<BridgeHealthResponse> {
    return this.request("/health", bridgeHealthResponseSchema);
  }

  capabilities(): Promise<BridgeCapabilitiesResponse> {
    return this.request("/capabilities", bridgeCapabilitiesResponseSchema);
  }

  catalog(): Promise<BridgeCatalogResponse> {
    return this.request("/catalog", bridgeCatalogResponseSchema);
  }

  query(input: BridgeQueryRequest): Promise<BridgeQueryResponse> {
    return this.request("/query", bridgeQueryResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  sources(): Promise<BridgeSourcesResponse> {
    return this.request("/sources", bridgeSourcesResponseSchema);
  }

  attachSource(
    input: BridgeAttachSourceRequest,
  ): Promise<BridgeSourcesResponse> {
    return this.request("/sources/attach", bridgeSourcesResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  detachSource(id: string): Promise<BridgeSourcesResponse> {
    return this.request(
      `/sources/${encodeURIComponent(id)}`,
      bridgeSourcesResponseSchema,
      { method: "DELETE" },
    );
  }

  private async request<T>(
    path: string,
    schema: { parse: (value: unknown) => T },
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) {
      headers.set("content-type", "application/json");
    }
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const payload = await response.json();

    if (!response.ok) {
      const parsed = bridgeErrorResponseSchema.safeParse(payload);
      const message = parsed.success
        ? parsed.data.error.message
        : `Bridge request failed with ${response.status}`;
      throw new Error(message);
    }

    return schema.parse(payload);
  }
}
