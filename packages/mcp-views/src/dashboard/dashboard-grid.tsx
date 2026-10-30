import type { CSSProperties } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { Message } from "../shared/message";
import { VisualBody } from "../shared/visual-body";
import type { DashboardCard, DashboardLayout } from "./dashboard-payload";

const ROW_HEIGHT = 100;
const GAP = 12;

// Lays cards out on the dashboard's grid (x, y, w, h in grid units), or stacks
// them in reading order when `stacked` (mobile or a narrow container).
export function DashboardGrid({
  cards,
  columns,
  stacked,
}: {
  cards: DashboardCard[];
  columns: number;
  stacked: boolean;
}) {
  const columnCount = Math.max(1, Math.floor(columns) || 1);
  const ordered = stacked
    ? [...cards].sort(
        (a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
      )
    : cards;

  return (
    <div
      className="grid"
      style={{
        gap: GAP,
        gridTemplateColumns: stacked
          ? "minmax(0, 1fr)"
          : `repeat(${columnCount}, minmax(0, 1fr))`,
        gridAutoRows: ROW_HEIGHT,
      }}
    >
      {ordered.map((card) => (
        <article
          key={card.id}
          className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-lg border bg-card p-3 text-card-foreground"
          style={placement(card.layout, columnCount, stacked)}
        >
          <CardContent card={card} />
        </article>
      ))}
    </div>
  );
}

function CardContent({ card }: { card: DashboardCard }) {
  if (card.kind === "text") {
    return (
      <>
        {card.title ? <CardTitle>{card.title}</CardTitle> : null}
        <div className="min-h-0 flex-1 overflow-auto">
          <MarkdownRenderer>{card.content}</MarkdownRenderer>
        </div>
      </>
    );
  }

  const { visual, error } = card;
  return (
    <>
      {visual?.title ? <CardTitle>{visual.title}</CardTitle> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : visual ? (
          <VisualBody payload={visual} kind={visual.visualType} fill />
        ) : (
          <Message>No data.</Message>
        )}
      </div>
      {visual?.truncated ? (
        <p className="text-[11px] text-muted-foreground">
          First {visual.rows.length.toLocaleString()} of{" "}
          {visual.rowCount.toLocaleString()} rows
        </p>
      ) : null}
    </>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <h2 className={cn("truncate text-sm font-semibold")} title={children}>
      {children}
    </h2>
  );
}

function placement(
  layout: DashboardLayout,
  columns: number,
  stacked: boolean,
): CSSProperties {
  const height = Math.max(1, Math.round(layout.h) || 1);
  if (stacked) {
    return { gridRow: `span ${height}` };
  }
  const width = Math.min(columns, Math.max(1, Math.round(layout.w) || 1));
  const x = Math.min(columns - width, Math.max(0, Math.round(layout.x) || 0));
  const y = Math.max(0, Math.round(layout.y) || 0);
  return {
    gridColumn: `${x + 1} / span ${width}`,
    gridRow: `${y + 1} / span ${height}`,
  };
}
