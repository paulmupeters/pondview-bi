import type { App } from "@modelcontextprotocol/ext-apps";
import {
  useApp,
  useHostStyleVariables,
} from "@modelcontextprotocol/ext-apps/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  Download,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  Search,
  Table2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./query-results.css";
import { QueryResultsChart } from "./query-results-chart";
import {
  buildQueryChartPoints,
  type QueryChartConfig,
  type QueryChartType,
  queryChartNumericColumns,
  queryChartTitle,
  suggestQueryChart,
} from "./query-results-chart-model";
import {
  createQueryExport,
  type QueryExportFormat,
} from "./query-results-export";
import {
  filterQueryRows,
  formatQueryCell,
  nextQuerySort,
  parseQueryResultPayload,
  type QueryResultSort,
  sortQueryRows,
} from "./query-results-model";

type ToolResult = Parameters<NonNullable<App["ontoolresult"]>>[0];
type ResultView = "table" | "chart";
type ActionNotice = {
  tone: "success" | "error" | "neutral";
  text: string;
  url?: string;
};

const rowKeys = new WeakMap<Record<string, unknown>, string>();
let nextRowKey = 1;

function queryRowKey(row: Record<string, unknown>): string {
  const existing = rowKeys.get(row);
  if (existing) return existing;
  const key = `query-row-${nextRowKey}`;
  nextRowKey += 1;
  rowKeys.set(row, key);
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredResult(result: ToolResult): Record<string, unknown> | null {
  return isRecord(result.structuredContent) ? result.structuredContent : null;
}

function toolResultText(result: ToolResult): string | null {
  const block = result.content?.find(
    (item): item is { type: "text"; text: string } =>
      item.type === "text" && "text" in item,
  );
  return block?.text ?? null;
}

function SortIcon({
  sort,
  column,
}: {
  sort: QueryResultSort | null;
  column: string;
}) {
  if (sort?.column !== column) {
    return <ArrowUpDown className="sort-icon" aria-hidden="true" />;
  }
  return sort.direction === "ascending" ? (
    <ArrowUp className="sort-icon" aria-hidden="true" />
  ) : (
    <ArrowDown className="sort-icon" aria-hidden="true" />
  );
}

function QueryResultsApp() {
  const [toolResult, setToolResult] = useState<ToolResult | null>(null);
  const [cancelledReason, setCancelledReason] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<QueryResultSort | null>(null);
  const [view, setView] = useState<ResultView>("table");
  const [chartConfig, setChartConfig] = useState<QueryChartConfig | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardId, setDashboardId] = useState("");
  const [dashboardTitle, setDashboardTitle] = useState("MCP analysis");
  const [visualTitle, setVisualTitle] = useState("Query result");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const onAppCreated = useCallback((app: App) => {
    app.ontoolresult = (result) => {
      setToolResult(result);
      setCancelledReason(null);
      setFilter("");
      setSort(null);
      setView("table");
      setDashboardOpen(false);
      setNotice(null);
    };
    app.ontoolcancelled = ({ reason }) => {
      setCancelledReason(reason ?? "The query was cancelled by the host.");
    };
  }, []);
  const { app, isConnected, error } = useApp({
    appInfo: { name: "Pondview Query Results", version: "0.2.0" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated,
    autoResize: true,
  });
  useHostStyleVariables(app, app?.getHostContext());

  const parsed = useMemo(
    () => parseQueryResultPayload(toolResult?.structuredContent),
    [toolResult],
  );
  const visibleRows = useMemo(() => {
    if (!parsed.ok) return [];
    return sortQueryRows(
      filterQueryRows(parsed.value.rows, parsed.value.columns, filter),
      sort,
    );
  }, [filter, parsed, sort]);

  useEffect(() => {
    if (!parsed.ok) return;
    const suggestion = suggestQueryChart(parsed.value);
    setChartConfig(suggestion);
    setVisualTitle(suggestion ? queryChartTitle(suggestion) : "Query result");
  }, [parsed]);

  const chartPoints = useMemo(
    () => (chartConfig ? buildQueryChartPoints(visibleRows, chartConfig) : []),
    [chartConfig, visibleRows],
  );
  const numericColumns = useMemo(
    () => (parsed.ok ? queryChartNumericColumns(parsed.value) : []),
    [parsed],
  );
  const hostCapabilities = isConnected ? app?.getHostCapabilities() : undefined;
  const canDownload = Boolean(hostCapabilities?.downloadFile);
  const canCallTools = Boolean(hostCapabilities?.serverTools);
  const canOpenLinks = Boolean(hostCapabilities?.openLinks);

  const download = async (format: QueryExportFormat) => {
    if (!app || !parsed.ok) return;
    if (!canDownload) {
      setNotice({
        tone: "error",
        text: "This host does not support App file downloads.",
      });
      return;
    }
    setBusyAction(`download-${format}`);
    setNotice(null);
    try {
      const file = createQueryExport(format, parsed.value.columns, visibleRows);
      const result = await app.downloadFile({
        contents: [
          {
            type: "resource",
            resource: {
              uri: `file:///${file.filename}`,
              mimeType: file.mimeType,
              text: file.text,
            },
          },
        ],
      });
      setNotice({
        tone: result.isError ? "error" : "success",
        text: result.isError
          ? "The export was denied or cancelled by the host."
          : `${file.filename} was sent to the host for download.`,
      });
    } catch (downloadError) {
      setNotice({
        tone: "error",
        text:
          downloadError instanceof Error
            ? downloadError.message
            : "The export could not be created.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const openUrl = async (url: string) => {
    if (!app || !canOpenLinks) {
      setNotice({
        tone: "neutral",
        text: "The host cannot open this link automatically.",
        url,
      });
      return;
    }
    const result = await app.openLink({ url });
    if (result.isError) {
      setNotice({
        tone: "error",
        text: "The host declined to open Pondview.",
        url,
      });
    }
  };

  const addToDashboard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!app || !parsed.ok) return;
    if (!canCallTools) {
      setNotice({
        tone: "error",
        text: "This host does not allow Apps to call server tools.",
      });
      return;
    }
    if (!parsed.value.sql) {
      setNotice({
        tone: "error",
        text: "The original SQL is unavailable for this result.",
      });
      return;
    }

    const useChart = view === "chart" && chartConfig !== null;
    setBusyAction("dashboard-add");
    setNotice(null);
    try {
      const result = await app.callServerTool({
        name: "create_visual",
        arguments: {
          ...(dashboardId.trim() ? { dashboardId: dashboardId.trim() } : {}),
          ...(!dashboardId.trim() && dashboardTitle.trim()
            ? { dashboardTitle: dashboardTitle.trim() }
            : {}),
          title: visualTitle.trim() || "Query result",
          sql: parsed.value.sql,
          visualType: useChart ? chartConfig.type : "table",
          ...(useChart
            ? { xKey: chartConfig.xKey, yKeys: [chartConfig.yKey] }
            : {}),
        },
      });
      const structured = structuredResult(result);
      const url =
        typeof structured?.url === "string" ? structured.url : undefined;
      const failed = Boolean(result.isError) || !url;
      setNotice({
        tone: failed ? "error" : "success",
        text: failed
          ? (toolResultText(result) ??
            "Pondview could not create the dashboard visual.")
          : `${useChart ? "Chart" : "Table"} added to the dashboard.`,
        ...(url ? { url } : {}),
      });
    } catch (dashboardError) {
      setNotice({
        tone: "error",
        text:
          dashboardError instanceof Error
            ? dashboardError.message
            : "Pondview could not create the dashboard visual.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const openDashboards = async () => {
    if (!app || !canCallTools) {
      setNotice({
        tone: "error",
        text: "This host does not allow Apps to call server tools.",
      });
      return;
    }
    setBusyAction("dashboard-open");
    setNotice(null);
    try {
      const result = await app.callServerTool({
        name: "open_dashboard",
        arguments: {},
      });
      const structured = structuredResult(result);
      const url = typeof structured?.url === "string" ? structured.url : null;
      if (!url) {
        setNotice({
          tone: "error",
          text: toolResultText(result) ?? "Pondview returned no dashboard URL.",
        });
      } else {
        await openUrl(url);
      }
    } catch (openError) {
      setNotice({
        tone: "error",
        text:
          openError instanceof Error
            ? openError.message
            : "The dashboard could not be opened.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (error) {
    return (
      <ResultState
        eyebrow="Connection error"
        title="Pondview could not connect"
      >
        {error.message}
      </ResultState>
    );
  }
  if (cancelledReason) {
    return (
      <ResultState eyebrow="Query stopped" title="The result was cancelled">
        {cancelledReason}
      </ResultState>
    );
  }
  if (!isConnected || !toolResult) {
    return (
      <ResultState eyebrow="Pondview MCP" title="Preparing the data view" busy>
        Waiting for the query result from the host.
      </ResultState>
    );
  }
  if (toolResult.isError) {
    return (
      <ResultState
        eyebrow="Query error"
        title="DuckDB could not run this query"
      >
        {toolResultText(toolResult) ??
          "The query failed without an error message."}
      </ResultState>
    );
  }
  if (!parsed.ok) {
    return (
      <ResultState
        eyebrow="Result error"
        title="This result cannot be displayed"
      >
        {parsed.error}
      </ResultState>
    );
  }

  const { columns, rows, rowCount, rowsChanged } = parsed.value;
  const isLimited = rowCount > rows.length;
  const resultLabel = `${rowCount.toLocaleString()} ${rowCount === 1 ? "row" : "rows"}`;
  const columnLabel = `${columns.length.toLocaleString()} ${columns.length === 1 ? "column" : "columns"}`;

  return (
    <article className="result-shell">
      <header className="result-header">
        <div>
          <p className="eyebrow">
            <span className="status-dot" aria-hidden="true" /> Pondview query
          </p>
          <h1>Result set</h1>
        </div>
        <section className="result-stats" aria-label="Query result summary">
          <span>{resultLabel}</span>
          <span>{columnLabel}</span>
          {typeof rowsChanged === "number" && rowsChanged > 0 ? (
            <span>{rowsChanged.toLocaleString()} changed</span>
          ) : null}
        </section>
      </header>

      <div className="result-commandbar">
        <fieldset className="view-switch">
          <legend className="sr-only">Result view</legend>
          <button
            type="button"
            className={view === "table" ? "is-active" : undefined}
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
          >
            <Table2 aria-hidden="true" /> Table
          </button>
          <button
            type="button"
            className={view === "chart" ? "is-active" : undefined}
            onClick={() => setView("chart")}
            aria-pressed={view === "chart"}
            disabled={!chartConfig}
          >
            <BarChart3 aria-hidden="true" /> Chart
          </button>
        </fieldset>
        <div className="command-actions">
          <button
            type="button"
            className="quiet-action"
            onClick={() => download("csv")}
            disabled={busyAction !== null || visibleRows.length === 0}
            title={
              canDownload
                ? "Export current view as CSV"
                : "File downloads are not supported by this host"
            }
          >
            {busyAction === "download-csv" ? (
              <LoaderCircle className="spin" />
            ) : (
              <Download />
            )}{" "}
            CSV
          </button>
          <button
            type="button"
            className="quiet-action"
            onClick={() => download("json")}
            disabled={busyAction !== null || visibleRows.length === 0}
            title={
              canDownload
                ? "Export current view as JSON"
                : "File downloads are not supported by this host"
            }
          >
            {busyAction === "download-json" ? (
              <LoaderCircle className="spin" />
            ) : (
              <Download />
            )}{" "}
            JSON
          </button>
          <button
            type="button"
            className={
              dashboardOpen ? "primary-action is-active" : "primary-action"
            }
            onClick={() => setDashboardOpen((current) => !current)}
            disabled={!parsed.value.sql}
          >
            <LayoutDashboard aria-hidden="true" /> Dashboard
          </button>
        </div>
      </div>

      <div className="result-toolbar">
        <label className="filter-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Filter returned rows</span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
            placeholder="Filter returned rows…"
          />
        </label>
        {view === "chart" && chartConfig ? (
          <fieldset className="chart-controls">
            <legend className="sr-only">Chart configuration</legend>
            <label>
              <span>Type</span>
              <select
                value={chartConfig.type}
                onChange={(event) =>
                  setChartConfig({
                    ...chartConfig,
                    type: event.currentTarget.value as QueryChartType,
                  })
                }
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="pie">Donut</option>
              </select>
            </label>
            <label>
              <span>Group</span>
              <select
                value={chartConfig.xKey}
                onChange={(event) =>
                  setChartConfig({
                    ...chartConfig,
                    xKey: event.currentTarget.value,
                  })
                }
              >
                {columns
                  .filter((column) => column.name !== chartConfig.yKey)
                  .map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Value</span>
              <select
                value={chartConfig.yKey}
                onChange={(event) =>
                  setChartConfig({
                    ...chartConfig,
                    yKey: event.currentTarget.value,
                  })
                }
              >
                {numericColumns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : (
          <p className="visible-count" aria-live="polite">
            {filter
              ? `${visibleRows.length.toLocaleString()} of ${rows.length.toLocaleString()} shown`
              : `${rows.length.toLocaleString()} shown`}
          </p>
        )}
      </div>

      {dashboardOpen ? (
        <form className="dashboard-panel" onSubmit={addToDashboard}>
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">Dashboard action</p>
              <h2>
                Add the current{" "}
                {view === "chart" && chartConfig ? "chart" : "table"}
              </h2>
            </div>
            <button
              type="button"
              className="icon-action"
              onClick={() => setDashboardOpen(false)}
              aria-label="Close dashboard actions"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="dashboard-fields">
            <label>
              <span>Visual title</span>
              <input
                value={visualTitle}
                onChange={(event) => setVisualTitle(event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span>New dashboard title</span>
              <input
                value={dashboardTitle}
                onChange={(event) =>
                  setDashboardTitle(event.currentTarget.value)
                }
                disabled={dashboardId.trim().length > 0}
              />
            </label>
            <label>
              <span>Or existing dashboard ID</span>
              <input
                value={dashboardId}
                onChange={(event) => setDashboardId(event.currentTarget.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="dashboard-panel-actions">
            <button
              type="button"
              className="quiet-action"
              onClick={openDashboards}
              disabled={busyAction !== null}
            >
              {busyAction === "dashboard-open" ? (
                <LoaderCircle className="spin" />
              ) : (
                <ExternalLink />
              )}{" "}
              Browse dashboards
            </button>
            <button
              type="submit"
              className="primary-action"
              disabled={busyAction !== null || !canCallTools}
            >
              {busyAction === "dashboard-add" ? (
                <LoaderCircle className="spin" />
              ) : (
                <LayoutDashboard />
              )}{" "}
              Add to dashboard
            </button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <div className={`action-notice is-${notice.tone}`} role="status">
          {notice.tone === "success" ? <Check aria-hidden="true" /> : null}
          <span>{notice.text}</span>
          {notice.url ? (
            <button type="button" onClick={() => openUrl(notice.url ?? "")}>
              Open <ExternalLink aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="dismiss-notice"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {columns.length === 0 || rows.length === 0 ? (
        <div className="empty-result">
          <span aria-hidden="true">∅</span>
          <h2>No rows returned</h2>
          <p>
            The query completed successfully but produced an empty result set.
          </p>
        </div>
      ) : view === "chart" && chartConfig ? (
        <QueryResultsChart
          config={chartConfig}
          points={chartPoints}
          sourceRowCount={visibleRows.length}
        />
      ) : (
        <div className="table-frame">
          <table>
            <thead>
              <tr>
                <th className="row-number-heading" scope="col">
                  #
                </th>
                {columns.map((column) => (
                  <th
                    key={column.name}
                    scope="col"
                    aria-sort={
                      sort?.column === column.name ? sort.direction : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((current) =>
                          nextQuerySort(current, column.name),
                        )
                      }
                    >
                      <span className="column-heading-content">
                        <strong className="column-name">{column.name}</strong>
                        {column.type ? (
                          <small className="column-type">{column.type}</small>
                        ) : null}
                      </span>
                      <SortIcon sort={sort} column={column.name} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={queryRowKey(row)}>
                  <th className="row-number" scope="row">
                    {rowIndex + 1}
                  </th>
                  {columns.map((column) => {
                    const value = row[column.name];
                    return (
                      <td
                        key={column.name}
                        className={
                          value === null || value === undefined
                            ? "null-value"
                            : undefined
                        }
                      >
                        {formatQueryCell(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 ? (
            <div className="no-match">No returned rows match “{filter}”.</div>
          ) : null}
        </div>
      )}

      <footer className="result-footer">
        <span>DuckDB result</span>
        {isLimited ? (
          <span className="limit-note">
            Showing the first {rows.length.toLocaleString()} rows
          </span>
        ) : (
          <span>Complete result</span>
        )}
      </footer>
    </article>
  );
}

function ResultState({
  eyebrow,
  title,
  children,
  busy = false,
}: {
  eyebrow: string;
  title: string;
  children: string;
  busy?: boolean;
}) {
  return (
    <section className="state-shell" aria-busy={busy}>
      <p className="eyebrow">{eyebrow}</p>
      <div
        className={busy ? "state-mark is-busy" : "state-mark"}
        aria-hidden="true"
      >
        {busy ? "" : "!"}
      </div>
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing MCP App root element.");
createRoot(root).render(<QueryResultsApp />);
