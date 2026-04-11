import { isMotherDuckIdentifier } from "@/lib/duckdb/motherduck";
import { detectExternalConnection } from "@/lib/duckdb/path";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";

export type DashboardSourceKind = "runtime" | "motherduck" | "external";
export type DashboardExternalType = "postgres" | "mysql" | "sqlite";

export type DashboardSourceDescriptor = {
  kind: DashboardSourceKind;
  runtimeBackend: SqlBackend;
  dbIdentifier: string | null;
  catalogContext: string | null;
  externalType?: DashboardExternalType;
};

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function normalizeDashboardSourceDescriptor(
  descriptor: DashboardSourceDescriptor,
): DashboardSourceDescriptor {
  const dbIdentifier = toNullableString(descriptor.dbIdentifier);
  const catalogContext = toNullableString(descriptor.catalogContext);

  if (descriptor.kind === "runtime") {
    return {
      kind: "runtime",
      runtimeBackend: descriptor.runtimeBackend,
      dbIdentifier:
        descriptor.runtimeBackend === "duckdb-wasm"
          ? (dbIdentifier ?? DEFAULT_WASM_DB_IDENTIFIER)
          : dbIdentifier,
      catalogContext,
    };
  }

  if (descriptor.kind === "motherduck") {
    return {
      kind: "motherduck",
      runtimeBackend: descriptor.runtimeBackend,
      dbIdentifier,
      catalogContext: null,
    };
  }

  return {
    kind: "external",
    runtimeBackend: descriptor.runtimeBackend,
    dbIdentifier,
    catalogContext,
    externalType: descriptor.externalType,
  };
}

export function buildDashboardSourceDescriptor(input: {
  runtimeBackend: SqlBackend;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
}): DashboardSourceDescriptor {
  const dbIdentifier = toNullableString(input.dbIdentifier);
  const catalogContext = toNullableString(input.catalogContext);

  if (dbIdentifier && isMotherDuckIdentifier(dbIdentifier)) {
    return normalizeDashboardSourceDescriptor({
      kind: "motherduck",
      runtimeBackend: input.runtimeBackend,
      dbIdentifier,
      catalogContext: null,
    });
  }

  const external = dbIdentifier ? detectExternalConnection(dbIdentifier) : null;
  if (
    external &&
    (external.type === "postgres" ||
      external.type === "mysql" ||
      external.type === "sqlite")
  ) {
    return normalizeDashboardSourceDescriptor({
      kind: "external",
      runtimeBackend: input.runtimeBackend,
      dbIdentifier,
      catalogContext,
      externalType: external.type,
    });
  }

  return normalizeDashboardSourceDescriptor({
    kind: "runtime",
    runtimeBackend: input.runtimeBackend,
    dbIdentifier:
      input.runtimeBackend === "duckdb-wasm" &&
      isWasmLocalIdentifier(dbIdentifier ?? undefined)
        ? DEFAULT_WASM_DB_IDENTIFIER
        : dbIdentifier,
    catalogContext,
  });
}

export function parseDashboardSourceDescriptor(
  value: unknown,
): DashboardSourceDescriptor | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const runtimeBackend = candidate.runtimeBackend;
  if (
    (kind !== "runtime" && kind !== "motherduck" && kind !== "external") ||
    (runtimeBackend !== "duckdb-wasm" &&
      runtimeBackend !== "bridge" &&
      runtimeBackend !== "duckdb-http")
  ) {
    return null;
  }

  const descriptor: DashboardSourceDescriptor = {
    kind,
    runtimeBackend,
    dbIdentifier: toNullableString(candidate.dbIdentifier),
    catalogContext: toNullableString(candidate.catalogContext),
  };

  if (
    kind === "external" &&
    (candidate.externalType === "postgres" ||
      candidate.externalType === "mysql" ||
      candidate.externalType === "sqlite")
  ) {
    descriptor.externalType = candidate.externalType;
  }

  return normalizeDashboardSourceDescriptor(descriptor);
}

export function parseDashboardSourceDescriptorJson(
  value: unknown,
): DashboardSourceDescriptor | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    return parseDashboardSourceDescriptor(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializeDashboardSourceDescriptor(
  descriptor: DashboardSourceDescriptor | null | undefined,
): string | null {
  if (!descriptor) {
    return null;
  }

  return JSON.stringify(normalizeDashboardSourceDescriptor(descriptor));
}

export function getDashboardSourceDescriptorRuntimeBackend(
  descriptor: DashboardSourceDescriptor | null | undefined,
): SqlBackend | null {
  return descriptor?.runtimeBackend ?? null;
}

export function getDashboardSourceDescriptorDbIdentifier(
  descriptor: DashboardSourceDescriptor | null | undefined,
): string | null {
  if (!descriptor) {
    return null;
  }

  return normalizeDashboardSourceDescriptor(descriptor).dbIdentifier;
}

export function getDashboardSourceDescriptorCatalogContext(
  descriptor: DashboardSourceDescriptor | null | undefined,
): string | null {
  return descriptor?.catalogContext ?? null;
}

export function isDashboardSourceDescriptorExternal(
  descriptor: DashboardSourceDescriptor | null | undefined,
): boolean {
  return descriptor?.kind === "external";
}
