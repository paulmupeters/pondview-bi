import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";
import { safeAreaStyle, textFromContent, useThemeClass } from "../shared/host";
import { Message } from "../shared/message";
import { DashboardGrid } from "./dashboard-grid";
import {
  type DashboardPayload,
  readDashboardPayload,
} from "./dashboard-payload";
import {
  describeFilters,
  type SlicerValue,
  slicerSelection,
  withSlicerSelection,
} from "./filters";
import { SlicerBar } from "./slicer-bar";

// Below this width the grid collapses to a single column.
const NARROW_WIDTH = 640;

export function DashboardView() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();
  const [narrow, setNarrow] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  // Only the latest slicer request may replace the payload.
  const requestRef = useRef(0);

  const { app, error } = useApp({
    appInfo: { name: "pondview-dashboard", version: "0.1.0" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (created) => {
      created.ontoolresult = (result) => {
        if (result.isError) {
          setToolError(
            textFromContent(result.content) ?? "Loading the dashboard failed.",
          );
          return;
        }
        setToolError(null);
        setPayload(readDashboardPayload(result.structuredContent));
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

  const hasPayload = payload !== null;
  useEffect(() => {
    const element = containerRef.current;
    if (!hasPayload || !element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < NARROW_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPayload]);

  if (error) {
    return <Message>Could not connect to the host: {error.message}</Message>;
  }
  if (toolError) {
    return <Message>{toolError}</Message>;
  }
  if (!payload) {
    return <Message>Loading dashboard…</Message>;
  }

  const capabilities = app?.getHostCapabilities();
  const canFilter = Boolean(capabilities?.serverTools);
  const displayMode = hostContext?.displayMode ?? "inline";
  const nextMode = displayMode === "fullscreen" ? "inline" : "fullscreen";
  const canToggleDisplay = Boolean(
    hostContext?.availableDisplayModes?.includes(nextMode),
  );
  const stacked = hostContext?.platform === "mobile" || narrow;

  const changeSlicer = async (field: string, values: SlicerValue[]) => {
    if (!app) return;
    const request = ++requestRef.current;
    const filters = withSlicerSelection(payload, field, values);
    setFiltering(true);
    setFilterError(null);
    try {
      const result = await app.callServerTool({
        name: "get_dashboard_data",
        arguments: { dashboardId: payload.id, filters },
      });
      const next = readDashboardPayload(result.structuredContent);
      if (result.isError || !next) {
        throw new Error(
          textFromContent(result.content) ?? "Filtering the dashboard failed.",
        );
      }
      if (request !== requestRef.current) return;
      setPayload(next);
      if (capabilities?.updateModelContext) {
        await app.updateModelContext({
          content: [{ type: "text", text: describeFilters(next) }],
        });
      }
    } catch (cause) {
      if (request !== requestRef.current) return;
      setFilterError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === requestRef.current) setFiltering(false);
    }
  };

  const toggleDisplayMode = async () => {
    if (!app) return;
    try {
      const result = await app.requestDisplayMode({ mode: nextMode });
      setHostContext((previous) => ({ ...previous, displayMode: result.mode }));
    } catch (cause) {
      setFilterError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <main
      ref={containerRef}
      className="flex flex-col gap-3 bg-background p-4 text-foreground"
      style={safeAreaStyle(hostContext?.safeAreaInsets)}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold">
          {payload.title}
        </h1>
        {canToggleDisplay ? (
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/30"
            onClick={toggleDisplayMode}
          >
            {nextMode === "fullscreen" ? "Fullscreen" : "Exit fullscreen"}
          </button>
        ) : null}
      </header>

      {payload.slicers.length > 0 ? (
        <SlicerBar
          slicers={payload.slicers}
          selectionFor={(field) => slicerSelection(payload.filters, field)}
          disabled={!canFilter}
          onChange={changeSlicer}
        />
      ) : null}

      {filterError ? (
        <p className="text-xs text-destructive">{filterError}</p>
      ) : null}

      <div
        className={filtering ? "opacity-60 transition-opacity" : undefined}
        aria-busy={filtering}
      >
        <DashboardGrid
          cards={payload.cards}
          columns={payload.columns}
          stacked={stacked}
        />
      </div>

      {payload.skippedFilters.length > 0 ? (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">
            {payload.skippedFilters.length} filter
            {payload.skippedFilters.length === 1 ? "" : "s"} not applied to some
            cards
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {payload.skippedFilters.map((skipped) => (
              <li key={`${skipped.visualId}:${skipped.field}`}>
                {skipped.field} on {skipped.visualId}: {skipped.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}
