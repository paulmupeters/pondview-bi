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
  onToggleAiPane: (cellId: string, enabled: boolean) => void;
};

export function CellContent({
  cell,
  pendingBootstrap,
  notebookSession,
  onBootstrapConsumed,
  onToggleAiPane,
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
      onToggleAiPane={onToggleAiPane}
    />
  );
}

function CellContentAiSql({
  cell,
  pendingBootstrap,
  notebookSession,
  onBootstrapConsumed,
  onToggleAiPane,
}: CellContentProps) {
  const ai = useAnalysisCellAi({
    cell,
    entries: notebookSession.cellEntriesByCellId.get(cell.id) ?? [],
    notebookSession,
  });

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

    const bootstrapKey = `${cell.id}:${bootstrapPrompt}`;
    if (consumedBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    consumedBootstrapKeyRef.current = bootstrapKey;

    void ai.submitPrompt(bootstrapPrompt).finally(() => {
      onBootstrapConsumed(cell.id);
    });
  }, [bootstrapPrompt, cell.id, onBootstrapConsumed, ai.submitPrompt]);

  return (
    <div className="space-y-3">
      <AiResponseBanner ai={ai} />
      <SqlCell
        cell={cell}
        bootstrapSql={
          pendingBootstrap?.kind === "sql" &&
          pendingBootstrap.cellId === cell.id
            ? {
                sql: pendingBootstrap.sql,
                autorun: pendingBootstrap.autorun,
              }
            : null
        }
        notebookSession={notebookSession}
        onBootstrapConsumed={() => onBootstrapConsumed(cell.id)}
        aiEnabled={cell.aiEnabled}
        onToggleAi={() => onToggleAiPane(cell.id, !cell.aiEnabled)}
        ai={ai}
      />
    </div>
  );
}
