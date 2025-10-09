import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db
    .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .from(chats)
    .orderBy(desc(chats.updatedAt))
    .limit(5);

  return Response.json({ chats: rows });
}



