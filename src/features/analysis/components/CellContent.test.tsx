import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { renderToStaticMarkup } from "react-dom/server.node";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { AiCellState } from "@/features/analysis/components/AiCell";
import type { NotebookSession } from "@/hooks/use-notebook-session";

const aiState: AiCellState = {
  promptDraft: "",
  setPromptDraft: () => {},
  promptError: null,
  latestAssistantText: "AI says to keep this result visible.",
  transcriptMessages: [],
  isAssistantThinking: false,
  submitPrompt: async () => {},
};

type CellContentComponent =
  typeof import("@/features/analysis/components/CellContent").CellContent;

let CellContent: CellContentComponent;

beforeAll(async () => {
  mock.module("@/features/analysis/use-analysis-cell-ai", () => ({
    useAnalysisCellAi: () => aiState,
  }));

  ({ CellContent } = await import(
    "@/features/analysis/components/CellContent"
  ));
});

afterAll(() => {
  mock.restore();
});

function createCell(
  overrides: Partial<AnalysisCellState> = {},
): AnalysisCellState {
  return {
    id: "cell-1",
    notebookId: "notebook-1",
    position: 0,
    kind: "ai",
    aiEnabled: true,
    sqlEnabled: true,
    activeMode: "sql",
    promptText: "",
    sqlDraft: "select * from orders",
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

function createNotebookSession(): NotebookSession {
  return {
    isLoading: false,
    hasLoaded: true,
    error: null,
    notebook: null,
    cells: [],
    cellEntriesByCellId: new Map(),
    updateTitle: async () => {},
    addCell: async () => {
      throw new Error("not implemented");
    },
    appendCellEntry: async () => {
      throw new Error("not implemented");
    },
    updateCell: async () => {},
    deleteCell: async () => {},
    deleteCellEntry: async () => {},
    refreshUpdatedAt: async () => {},
    reload: async () => {},
  };
}

function installDomMocks() {
  globalThis.document ??= {
    body: {},
    documentElement: {
      classList: {
        contains: () => false,
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as never;
  globalThis.window ??= {
    document: globalThis.document,
  } as never;
}

describe("CellContent", () => {
  beforeEach(() => {
    installDomMocks();
    aiState.promptDraft = "";
    aiState.promptError = null;
    aiState.latestAssistantText = "AI says to keep this result visible.";
    aiState.transcriptMessages = [];
    aiState.isAssistantThinking = false;
  });

  test("keeps the AI response visible while the SQL mode is selected", () => {
    const markup = renderToStaticMarkup(
      <CellContent
        cell={createCell({ activeMode: "sql" })}
        pendingBootstrap={null}
        notebookSession={createNotebookSession()}
        onBootstrapConsumed={() => {}}
        onSelectCellMode={() => {}}
      />,
    );

    expect(markup).toContain("AI says to keep this result visible.");
    expect(markup).toContain("AI generated");
    expect(markup).toContain("Ask AI");
    expect(markup).toContain(">SQL<");
  });

  test("hides prompt errors while the SQL mode is selected", () => {
    aiState.promptError =
      "Missing AI configuration. Open Settings and configure provider, API key, and model.";
    aiState.latestAssistantText = null;

    const markup = renderToStaticMarkup(
      <CellContent
        cell={createCell({ activeMode: "sql" })}
        pendingBootstrap={null}
        notebookSession={createNotebookSession()}
        onBootstrapConsumed={() => {}}
        onSelectCellMode={() => {}}
      />,
    );

    expect(markup).not.toContain("Missing AI configuration");
    expect(markup).toContain("Ask AI");
    expect(markup).toContain(">SQL<");
  });
});
