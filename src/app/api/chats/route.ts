import { listRecentChats } from "@/lib/repositories/chat";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listRecentChats();

  return Response.json({ chats: rows });
}
