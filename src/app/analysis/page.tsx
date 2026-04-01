import { Suspense } from "react";
import Chat from "@/components/chat";
import { useNotebookSession } from "@/hooks/use-notebook-session";
import { useSearchParams } from "@/vite/next-navigation";

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading...</div>
      }
    >
      <AnalysisPageContent />
    </Suspense>
  );
}

function AnalysisPageContent() {
  const searchParams = useSearchParams();
  const notebookId = searchParams.get("id");
  const notebookSession = useNotebookSession(notebookId);

  if (!notebookId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing notebook id
      </div>
    );
  }

  return (
    <div className="font-sans h-full overflow-hidden">
      <Chat chatId={notebookId} notebookSession={notebookSession} />
    </div>
  );
}
