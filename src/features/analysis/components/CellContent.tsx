import { useEffect, useRef } from "react";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { AiResponseBanner } from "@/features/analysis/components/AiCell";
import { SqlCell } from "@/features/analysis/components/SqlCell";
import { TextCell } from "@/features/analysis/components/TextCell";
import { useAnalysisCellAi } from "@/features/analysis/use-analysis-cell-ai";
import type { NotebookSession } from "@/hooks/use-notebook-session";

type CellContentProps = {
  cell: AnalysisCellState;
  pendingBootstrap:
    | { kind: "ai"; cellId: string; prompt: string }
    | { kind: "sql"; cellId: string; sql: string; autorun: boolean }
    | null;
  notebookSession: NotebookSession;
  onBootstrapConsumed: (cellId: string) => void;
  onSelectCellMode: (cellId: string, mode: "ai" | "sql" | "text") => void;
  onStatusMessageChange?: (
    cellId: string,
    statusMessage: string | null,
  ) => void;
};

export function CellContent({
  cell,
  pendingBootstrap,
  notebookSession,
  onBootstrapConsumed,
  onSelectCellMode,
  onStatusMessageChange,
}: CellContentProps) {
  if (cell.activeMode === "text") {
    return <TextCell cell={cell} notebookSession={notebookSession} />;
  }

  return (
    <CellContentAiSql
      cell={cell}
      pendingBootstrap={pendingBootstrap}
      notebookSession={notebookSession}
      onBootstrapConsumed={onBootstrapConsumed}
      onSelectCellMode={onSelectCellMode}
      onStatusMessageChange={onStatusMessageChange}
    />
  );
}

function CellContentAiSql({
  cell,
  pendingBootstrap,
  notebookSession,
  onBootstrapConsumed,
  onSelectCellMode,
  onStatusMessageChange,
}: CellContentProps) {
  const ai = useAnalysisCellAi({
    cell,
    entries: notebookSession.cellEntriesByCellId.get(cell.id) ?? [],
    notebookSession,
  });
  const bootstrapSql =
    pendingBootstrap?.kind === "sql" && pendingBootstrap.cellId === cell.id
      ? {
          sql: pendingBootstrap.sql,
          autorun: pendingBootstrap.autorun,
        }
      : null;

  // Handle AI bootstrap prompt
  const consumedBootstrapKeyRef = useRef<string | null>(null);
  const bootstrapPrompt =
    pendingBootstrap?.kind === "ai" && pendingBootstrap.cellId === cell.id
      ? pendingBootstrap.prompt
      : null;

  useEffect(() => {
    if (!bootstrapPrompt) {
      consumedBootstrapKeyRef.current = null;
      return;
    }

    if (cell.activeMode !== "ai") {
      onSelectCellMode(cell.id, "ai");
    }

    const bootstrapKey = `${cell.id}:${bootstrapPrompt}`;
    if (consumedBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    consumedBootstrapKeyRef.current = bootstrapKey;

    void ai.submitPrompt(bootstrapPrompt).finally(() => {
      onBootstrapConsumed(cell.id);
    });
  }, [
    ai.submitPrompt,
    bootstrapPrompt,
    cell.activeMode,
    cell.id,
    onBootstrapConsumed,
    onSelectCellMode,
  ]);

  useEffect(() => {
    onStatusMessageChange?.(
      cell.id,
      cell.activeMode === "ai" ? ai.promptError : null,
    );

    return () => {
      onStatusMessageChange?.(cell.id, null);
    };
  }, [ai.promptError, cell.activeMode, cell.id, onStatusMessageChange]);

  useEffect(() => {
    if (!bootstrapSql || cell.activeMode === "sql") {
      return;
    }

    onSelectCellMode(cell.id, "sql");
  }, [bootstrapSql, cell.activeMode, cell.id, onSelectCellMode]);

  return (
    <div className="space-y-3">
      <AiResponseBanner ai={ai} showPromptError={cell.activeMode === "ai"} />
      <SqlCell
        cell={cell}
        bootstrapSql={bootstrapSql}
        notebookSession={notebookSession}
        onBootstrapConsumed={() => onBootstrapConsumed(cell.id)}
        aiEnabled={cell.activeMode === "ai"}
        onToggleAi={() =>
          onSelectCellMode(cell.id, cell.activeMode === "ai" ? "sql" : "ai")
        }
        onSelectMode={(mode) => onSelectCellMode(cell.id, mode)}
        ai={ai}
      />
    </div>
  );
}
