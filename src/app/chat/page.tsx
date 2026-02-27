import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Chat from "@/components/chat";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get("id");

  if (!chatId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing chat id
      </div>
    );
  }

  return (
    <div className="font-sans h-screen overflow-hidden">
      <Chat chatId={chatId} />
    </div>
  );
}
