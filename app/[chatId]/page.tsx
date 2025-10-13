import Chat from "@/components/chat";
import { headers } from "next/headers";

async function getInitialMessages(chatId: string) {
  try {
    const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const hdrs = await headers();
    const protocol = hdrs.get("x-forwarded-proto") ?? "http";
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    const baseUrl = envBaseUrl || (host ? `${protocol}://${host}` : "http://localhost:3000");

    const url = new URL(`/api/chat/${chatId}`, baseUrl).toString();

    const res = await fetch(url, {
      cache: "no-store",
      // When running on the same host, empty base URL works in Next.js runtime
      // but we fallback to NEXT_PUBLIC_APP_URL if provided.
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages ?? [];
  } catch (err) {
    console.error("Error fetching initial messages:", err);
    return [];
  }
}

export default async function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const initialMessages = await getInitialMessages(chatId);
  return (
    <div className="font-sans h-screen overflow-hidden">
      <Chat chatId={chatId} initialMessages={initialMessages} />
    </div>
  );
}