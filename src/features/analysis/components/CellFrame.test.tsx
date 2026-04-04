import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { CellFrame } from "@/features/analysis/components/CellFrame";

function createCell(
  overrides: Partial<AnalysisCellState> = {},
): AnalysisCellState {
  return {
    id: "cell-1",
    notebookId: "notebook-1",
    position: 1,
    kind: "ai",
    aiEnabled: true,
    sqlEnabled: false,
    activeMode: "ai",
    promptText: "select 5;",
    sqlDraft: null,
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "complete",
    resultPayloadJson: null,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    ...overrides,
  };
}

function renderCellFrame(cell: AnalysisCellState): string {
  return renderToStaticMarkup(
    <CellFrame
      cell={cell}
      isSelected={false}
      onSelect={() => {}}
      onDelete={() => {}}
    >
      <div>Cell body</div>
    </CellFrame>,
  );
}

describe("CellFrame", () => {
  test("renders the cell number and preview in the compact header without a badge", () => {
    const markup = renderCellFrame(createCell());

    expect(markup).toContain("Cell 2");
    expect(markup).toContain("select 5;");
    expect(markup).not.toContain('data-slot="badge"');
    expect(markup).toContain('data-status-icon="complete"');
  });

  test("renders a status icon for each supported cell status", () => {
    const idleMarkup = renderCellFrame(createCell({ status: "idle" }));
    const runningMarkup = renderCellFrame(createCell({ status: "running" }));
    const completeMarkup = renderCellFrame(createCell({ status: "complete" }));
    const errorMarkup = renderCellFrame(createCell({ status: "error" }));

    expect(idleMarkup).toContain('data-status-icon="idle"');
    expect(runningMarkup).toContain('data-status-icon="running"');
    expect(completeMarkup).toContain('data-status-icon="complete"');
    expect(errorMarkup).toContain('data-status-icon="error"');
    expect(runningMarkup).toContain("animate-spin");
  });

  test("keeps the delete action separate from the selectable header button", () => {
    const markup = renderCellFrame(createCell());

    expect(markup.match(/<button/g)?.length).toBe(2);
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Delete cell"');
    expect(markup).toMatch(
      /aria-pressed="false"[\s\S]*<\/button>[\s\S]*aria-label="Delete cell"/,
    );
  });

  test("uses the right preview fallback in each cell state", () => {
    expect(renderCellFrame(createCell())).toContain("select 5;");
    expect(
      renderCellFrame(
        createCell({
          promptText: "Explain the outliers",
          sqlDraft: "select * from orders",
          aiEnabled: true,
          sqlEnabled: true,
        }),
      ),
    ).toContain("select * from orders");
    expect(
      renderCellFrame(
        createCell({
          promptText: "Explain the outliers",
          sqlDraft: null,
        }),
      ),
    ).toContain("Explain the outliers");
    expect(
      renderCellFrame(
        createCell({
          promptText: "",
          sqlDraft: null,
          aiEnabled: true,
          sqlEnabled: false,
        }),
      ),
    ).toContain("Empty AI cell");
    expect(
      renderCellFrame(
        createCell({
          promptText: "",
          sqlDraft: null,
          aiEnabled: false,
          sqlEnabled: true,
          kind: "sql",
          activeMode: "sql",
        }),
      ),
    ).toContain("Empty SQL cell");
    expect(
      renderCellFrame(
        createCell({
          promptText: "",
          sqlDraft: null,
          aiEnabled: true,
          sqlEnabled: true,
          activeMode: "sql",
        }),
      ),
    ).toContain("Empty analysis cell");
  });
});
