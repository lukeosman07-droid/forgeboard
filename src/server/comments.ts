"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ItemComment } from "@/lib/types";
import { Id, firstIssue, type ActionResult } from "./schemas";
import { isDenied, refused, session } from "./session";

// Updates posted on a task. Commenting is the one thing a guest may write.

export async function addComment(itemId: string, body: string): Promise<ActionResult & { comment?: ItemComment }> {
  const parsed = z.string().trim().min(1, "Write something first.").max(5000).safeParse(body);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(itemId).success) return { error: "Invalid task." };

  const { supabase } = await session();
  const { data, error } = await supabase.from("item_comments").insert({ item_id: itemId, body: parsed.data }).select("*").single<ItemComment>();
  if (error || !data) return { error: isDenied(error) ? "You can't comment on this task." : "Couldn't post the update." };
  refresh();
  return { ok: true, comment: data };
}

/** People delete their own comments; admins can delete anyone's. */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const result = await supabase.from("item_comments").delete().eq("id", commentId).select("id");
  if (refused(result, "")) return { error: result.error ? "Couldn't delete the update." : "You can only delete your own updates." };
  refresh();
  return { ok: true };
}
