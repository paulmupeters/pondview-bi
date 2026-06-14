import { FileText } from "lucide-react";
import { Suspense } from "react";
import { AnalysisWorkspace } from "@/features/analysis/AnalysisWorkspace";
import { useNotebookSession } from "@/hooks/use-notebook-session";
import { useSearchParams } from "@/vite/next-navigation";

export default function AnalysisPage() {
  return (
    <Suspense fallback={<AnalysisPageSkeleton />}>
      <AnalysisPageContent />
    </Suspense>
  );
}

function AnalysisPageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="relative flex h-10 w-10 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-border" />
          <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          <FileText className="relative size-4 opacity-50" />
        </div>
        <span className="text-sm">Loading notebook…</span>
      </div>
    </div>
  );
}

function AnalysisPageContent() {
  const searchParams = useSearchParams();
  const notebookId = searchParams.get("id");
  const notebookSession = useNotebookSession(notebookId);

  if (!notebookId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-8 py-10 text-center">
          <p className="text-sm text-muted-foreground">Missing notebook id</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans h-full overflow-hidden">
      <AnalysisWorkspace
        notebookId={notebookId}
        notebookSession={notebookSession}
      />
    </div>
  );
}
