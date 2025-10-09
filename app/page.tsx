import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { chats } from "@/lib/db/schema";

export const runtime = "nodejs";

export default async function Home() {
  const id = nanoid();
  await db
    .insert(chats)
    .values({ id, createdAt: Date.now(), updatedAt: Date.now() })
    .onConflictDoNothing();
  redirect(`/${id}`);
}
