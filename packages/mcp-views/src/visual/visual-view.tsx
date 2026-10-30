import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { safeAreaStyle, textFromContent, useThemeClass } from "../shared/host";
import { Message } from "../shared/message";
import { VisualBody } from "../shared/visual-body";
import {
  readVisualPayload,
  type VisualKind,
  type VisualPayload,
} from "./visual-payload";
import { summarizeVisual } from "./visual-summary";

const CHART_KINDS: VisualKind[] = ["bar", "line", "area", "pie", "table"];

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; dashboardId: string }
  | { status: "error"; message: string };

type AskState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "error"; message: string };

export function VisualView() {
  const [payload, setPayload] = useState<VisualPayload | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();
  const [kind, setKind] = useState<VisualKind | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [askState, setAskState] = useState<AskState>({ status: "idle" });

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

  useThemeClass(hostContext?.theme);

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

  const canAsk = Boolean(app?.getHostCapabilities()?.message);

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

  const ask = async () => {
    if (!app) return;
    setAskState({ status: "sending" });
    try {
      const result = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: summarizeVisual(payload, kind) }],
      });
      if (result.isError) {
        throw new Error("The host declined the message.");
      }
      setAskState({ status: "idle" });
    } catch (cause) {
      setAskState({
        status: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  return (
    <main
      className="flex flex-col gap-3 bg-background p-4 text-foreground"
      style={safeAreaStyle(hostContext?.safeAreaInsets)}
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
          {canAsk ? (
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/30 disabled:opacity-50"
              disabled={askState.status === "sending"}
              onClick={ask}
            >
              Ask Claude about this
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
      {askState.status === "error" ? (
        <p className="text-xs text-destructive">{askState.message}</p>
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
