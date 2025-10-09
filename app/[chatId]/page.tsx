import Chat from "@/components/chat";

async function getInitialMessages(chatId: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/chat/${chatId}`, {
      cache: "no-store",
      // When running on the same host, empty base URL works in Next.js runtime
      // but we fallback to NEXT_PUBLIC_APP_URL if provided.
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages ?? [];
  } catch {
    return [];
  }
}

export default async function ChatPage({ params }: { params: { chatId: string } }) {
  const initialMessages = await getInitialMessages(params.chatId);
  return (
    <div className="font-sans h-screen overflow-hidden">
      <Chat chatId={params.chatId} initialMessages={initialMessages} />
    </div>
  );
}



