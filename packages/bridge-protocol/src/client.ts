import {
  type BridgeAttachSourceRequest,
  type BridgeCapabilitiesResponse,
  type BridgeCatalogResponse,
  type BridgeHealthResponse,
  type BridgeProjectDatabasePathPickResponse,
  type BridgeProjectDeleteFilesRequest,
  type BridgeProjectFilesResponse,
  type BridgeProjectInitRequest,
  type BridgeProjectReplaceFilesRequest,
  type BridgeProjectResponse,
  type BridgeProjectSaveFilesRequest,
  type BridgeProjectUpdateRequest,
  type BridgeQueryRequest,
  type BridgeQueryResponse,
  type BridgeS3BackupDownloadRequest,
  type BridgeS3BackupDownloadResponse,
  type BridgeS3BackupListResponse,
  type BridgeS3BackupTestResponse,
  type BridgeS3BackupUploadRequest,
  type BridgeS3BackupUploadResponse,
  type BridgeSecretAi,
  type BridgeSecretMutationResponse,
  type BridgeSecretS3Backup,
  type BridgeSecretSource,
  type BridgeSecretsStatusResponse,
  type BridgeSourcesResponse,
  bridgeCapabilitiesResponseSchema,
  bridgeCatalogResponseSchema,
  bridgeErrorResponseSchema,
  bridgeHealthResponseSchema,
  bridgeProjectDatabasePathPickResponseSchema,
  bridgeProjectFilesResponseSchema,
  bridgeProjectResponseSchema,
  bridgeQueryResponseSchema,
  bridgeS3BackupDownloadResponseSchema,
  bridgeS3BackupListResponseSchema,
  bridgeS3BackupTestResponseSchema,
  bridgeS3BackupUploadResponseSchema,
  bridgeSecretMutationResponseSchema,
  bridgeSecretsStatusResponseSchema,
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

  project(): Promise<BridgeProjectResponse> {
    return this.request("/project", bridgeProjectResponseSchema);
  }

  updateProject(
    input: BridgeProjectUpdateRequest,
  ): Promise<BridgeProjectResponse> {
    return this.request("/project", bridgeProjectResponseSchema, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  projectFiles(): Promise<BridgeProjectFilesResponse> {
    return this.request("/project/files", bridgeProjectFilesResponseSchema);
  }

  saveProjectFiles(
    input: BridgeProjectSaveFilesRequest,
  ): Promise<BridgeProjectFilesResponse> {
    return this.request("/project/files", bridgeProjectFilesResponseSchema, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  initProject(
    input: BridgeProjectInitRequest,
  ): Promise<BridgeProjectFilesResponse> {
    return this.request("/project/init", bridgeProjectFilesResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  pickProjectDatabasePath(): Promise<BridgeProjectDatabasePathPickResponse> {
    return this.request(
      "/project/database-path/pick",
      bridgeProjectDatabasePathPickResponseSchema,
      { method: "POST" },
    );
  }

  replaceProjectFiles(
    input: BridgeProjectReplaceFilesRequest,
  ): Promise<BridgeProjectFilesResponse> {
    return this.request(
      "/project/files/replace",
      bridgeProjectFilesResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  deleteProjectFiles(
    input: BridgeProjectDeleteFilesRequest,
  ): Promise<BridgeProjectFilesResponse> {
    return this.request("/project/files", bridgeProjectFilesResponseSchema, {
      method: "DELETE",
      body: JSON.stringify(input),
    });
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

  secretsStatus(): Promise<BridgeSecretsStatusResponse> {
    return this.request("/secrets/status", bridgeSecretsStatusResponseSchema);
  }

  saveSourceSecret(
    id: string,
    input: BridgeSecretSource,
  ): Promise<BridgeSecretMutationResponse> {
    return this.request(
      `/secrets/source/${encodeURIComponent(id)}`,
      bridgeSecretMutationResponseSchema,
      { method: "PUT", body: JSON.stringify(input) },
    );
  }

  deleteSourceSecret(id: string): Promise<BridgeSecretMutationResponse> {
    return this.request(
      `/secrets/source/${encodeURIComponent(id)}`,
      bridgeSecretMutationResponseSchema,
      { method: "DELETE" },
    );
  }

  saveAiSecret(input: BridgeSecretAi): Promise<BridgeSecretMutationResponse> {
    return this.request("/secrets/ai", bridgeSecretMutationResponseSchema, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  deleteAiSecret(): Promise<BridgeSecretMutationResponse> {
    return this.request("/secrets/ai", bridgeSecretMutationResponseSchema, {
      method: "DELETE",
    });
  }

  saveS3BackupSecret(
    input: BridgeSecretS3Backup,
  ): Promise<BridgeSecretMutationResponse> {
    return this.request(
      "/secrets/s3-backup",
      bridgeSecretMutationResponseSchema,
      { method: "PUT", body: JSON.stringify(input) },
    );
  }

  deleteS3BackupSecret(): Promise<BridgeSecretMutationResponse> {
    return this.request(
      "/secrets/s3-backup",
      bridgeSecretMutationResponseSchema,
      {
        method: "DELETE",
      },
    );
  }

  testS3Backup(): Promise<BridgeS3BackupTestResponse> {
    return this.request("/s3-backup/test", bridgeS3BackupTestResponseSchema, {
      method: "POST",
    });
  }

  listS3Backup(): Promise<BridgeS3BackupListResponse> {
    return this.request("/s3-backup/list", bridgeS3BackupListResponseSchema, {
      method: "POST",
    });
  }

  uploadS3Backup(
    input: BridgeS3BackupUploadRequest,
  ): Promise<BridgeS3BackupUploadResponse> {
    return this.request(
      "/s3-backup/upload",
      bridgeS3BackupUploadResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  downloadS3Backup(
    input: BridgeS3BackupDownloadRequest,
  ): Promise<BridgeS3BackupDownloadResponse> {
    return this.request(
      "/s3-backup/download",
      bridgeS3BackupDownloadResponseSchema,
      { method: "POST", body: JSON.stringify(input) },
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
