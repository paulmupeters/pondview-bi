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
  test("renders the compact shell chrome without a badge or inline preview", () => {
    const markup = renderCellFrame(createCell());

    expect(markup).toContain("Cell 2");
    expect(markup).toContain("Cell body");
    expect(markup).not.toContain("select 5;");
    expect(markup).not.toContain('data-slot="badge"');
    expect(markup).toContain('data-status-icon="complete"');
    expect(markup).toContain('aria-label="Collapse cell"');
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

  test("keeps the collapse, select, and delete actions separate", () => {
    const markup = renderCellFrame(createCell());

    expect(markup.match(/<button/g)?.length).toBe(3);
    expect(markup).toContain('aria-label="Collapse cell"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Delete cell"');
    expect(markup).toMatch(
      /aria-label="Collapse cell"[\s\S]*aria-pressed="false"[\s\S]*aria-label="Delete cell"/,
    );
  });

  test("labels text cells distinctly from analysis cells", () => {
    const analysisMarkup = renderCellFrame(createCell());
    const textMarkup = renderCellFrame(
      createCell({
        kind: "text",
        activeMode: "text",
      }),
    );

    expect(analysisMarkup).toContain("Cell 2");
    expect(textMarkup).toContain("Text 2");
  });
});
