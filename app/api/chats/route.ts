import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { chats } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .from(chats)
    .orderBy(desc(chats.updatedAt))
    .limit(12);

  return Response.json({ chats: rows });
}