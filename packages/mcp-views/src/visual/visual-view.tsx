import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { type ReactNode, useEffect, useState } from "react";
import { DynamicChart } from "@/components/dynamic-chart";
import { MetricCard } from "@/components/metric-card";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  readVisualPayload,
  type VisualKind,
  type VisualPayload,
} from "./visual-payload";

const CHART_KINDS: VisualKind[] = ["bar", "line", "area", "pie", "table"];
const TABLE_ROW_LIMIT = 200;

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; dashboardId: string }
  | { status: "error"; message: string };

export function VisualView() {
  const [payload, setPayload] = useState<VisualPayload | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();
  const [kind, setKind] = useState<VisualKind | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const { app, error } = useApp({
    appInfo: { name: "pondview-visual", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolresult = (result) => {
        if (result.isError) {
          setToolError(textFromContent(result.content) ?? "The query failed.");
          return;
        }
        const next = readVisualPayload(result.structuredContent);
        setPayload(next);
        setKind(next?.visualType ?? null);
        setSaveState(
          next?.saved
            ? { status: "saved", dashboardId: next.saved.dashboardId }
            : { status: "idle" },
        );
      };
      created.onhostcontextchanged = (context) => {
        setHostContext((previous) => ({ ...previous, ...context }));
      };
    },
  });

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    if (app) {
      setHostContext(app.getHostContext());
    }
  }, [app]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      hostContext?.theme === "dark",
    );
  }, [hostContext?.theme]);

  if (error) {
    return <Message>Could not connect to the host: {error.message}</Message>;
  }
  if (toolError) {
    return <Message>{toolError}</Message>;
  }
  if (!payload || !kind) {
    return <Message>Running query…</Message>;
  }

  const canSave =
    saveState.status !== "saved" &&
    Boolean(app?.getHostCapabilities()?.serverTools);

  const save = async () => {
    if (!app) return;
    setSaveState({ status: "saving" });
    try {
      const result = await app.callServerTool({
        name: "create_visual",
        arguments: {
          title: payload.title,
          ...(payload.description ? { description: payload.description } : {}),
          sql: payload.sql,
          visualType: kind,
          ...chartKeys(payload.config),
        },
      });
      const saved = readVisualPayload(result.structuredContent)?.saved;
      if (result.isError || !saved) {
        throw new Error(textFromContent(result.content) ?? "Save failed.");
      }
      setSaveState({ status: "saved", dashboardId: saved.dashboardId });
    } catch (cause) {
      setSaveState({
        status: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const insets = hostContext?.safeAreaInsets;

  return (
    <main
      className="flex flex-col gap-3 bg-background p-4 text-foreground"
      style={
        insets
          ? {
              paddingTop: insets.top + 16,
              paddingRight: insets.right + 16,
              paddingBottom: insets.bottom + 16,
              paddingLeft: insets.left + 16,
            }
          : undefined
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{payload.title}</h1>
          {payload.description ? (
            <p className="text-sm text-muted-foreground">
              {payload.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {payload.visualType !== "card" ? (
            <KindSwitcher value={kind} onChange={setKind} />
          ) : null}
          {canSave ? (
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/30 disabled:opacity-50"
              disabled={saveState.status === "saving"}
              onClick={save}
            >
              {saveState.status === "saving" ? "Saving…" : "Save to dashboard"}
            </button>
          ) : null}
          {saveState.status === "saved" ? (
            <span className="text-xs text-muted-foreground">
              Saved to {saveState.dashboardId}
            </span>
          ) : null}
        </div>
      </header>

      {saveState.status === "error" ? (
        <p className="text-xs text-destructive">{saveState.message}</p>
      ) : null}

      <VisualBody payload={payload} kind={kind} />

      {payload.truncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {payload.rows.length.toLocaleString()} of{" "}
          {payload.rowCount.toLocaleString()} rows. Aggregate in SQL to see
          everything.
        </p>
      ) : null}
    </main>
  );
}

function VisualBody({
  payload,
  kind,
}: {
  payload: VisualPayload;
  kind: VisualKind;
}) {
  if (payload.rows.length === 0) {
    return <Message>The query returned no rows.</Message>;
  }

  if (kind === "card") {
    const firstColumn = payload.columns[0]?.name;
    const value = firstColumn ? payload.rows[0]?.[firstColumn] : undefined;
    return (
      <MetricCard
        value={value as string | number | boolean | null | undefined}
        title={payload.title}
        showTitle={false}
      />
    );
  }

  if (kind === "table") {
    return <ResultsTable payload={payload} />;
  }

  return (
    <DynamicChart
      chartData={payload.rows as Result[]}
      chartConfig={{ ...payload.config, type: kind } as Config}
      chartHeightClassName="h-[300px]"
      showMetadata={false}
    />
  );
}

function KindSwitcher({
  value,
  onChange,
}: {
  value: VisualKind;
  onChange: (kind: VisualKind) => void;
}) {
  return (
    <fieldset className="flex rounded-md border p-0.5">
      <legend className="sr-only">Visual type</legend>
      {CHART_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={kind === value}
          className={cn(
            "rounded px-2 py-0.5 text-xs capitalize",
            kind === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(kind)}
        >
          {kind}
        </button>
      ))}
    </fieldset>
  );
}

function ResultsTable({ payload }: { payload: VisualPayload }) {
  const rows = payload.rows.slice(0, TABLE_ROW_LIMIT);
  return (
    <div className="max-h-[360px] overflow-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-background">
          <tr>
            {payload.columns.map((column) => (
              <th
                key={column.name}
                className="border-b px-2 py-1.5 font-medium"
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: result rows have no stable id
            <tr key={index} className="border-b last:border-0">
              {payload.columns.map((column) => (
                <td key={column.name} className="px-2 py-1 tabular-nums">
                  {formatCell(row[column.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function chartKeys(config: Record<string, unknown>): {
  xKey?: string;
  yKeys?: string[];
} {
  return {
    ...(typeof config.xKey === "string" && config.xKey
      ? { xKey: config.xKey }
      : {}),
    ...(Array.isArray(config.yKeys) && config.yKeys.length > 0
      ? {
          yKeys: config.yKeys.filter(
            (key): key is string => typeof key === "string",
          ),
        }
      : {}),
  };
}

function textFromContent(
  content: Array<{ type: string; text?: string }> | undefined,
): string | null {
  const text = content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
  return text || null;
}
