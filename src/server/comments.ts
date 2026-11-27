"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { ItemComment } from "@/lib/types";
import { deliverQuietly } from "./deliver";
import { Id, firstIssue, type ActionResult } from "./schemas";
import { isDenied, refused, session } from "./session";

// Updates posted on a task. Commenting is the one thing a guest may write.
// Bodies are Markdown with @mentions stored as @[Name](user-id); the database
// turns mentions into notifications (and queued emails, sent just below).

const Body = z.string().trim().min(1, "Write something first.").max(5000, "Keep updates under 5,000 characters.");

export async function addComment(itemId: string, body: string): Promise<ActionResult & { comment?: ItemComment }> {
  const parsed = Body.safeParse(body);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(itemId).success) return { error: "Invalid task." };

  const { supabase } = await session();
  const { data, error } = await supabase.from("item_comments").insert({ item_id: itemId, body: parsed.data }).select("*").single<ItemComment>();
  if (error || !data) return { error: isDenied(error) ? "You can't comment on this task." : "Couldn't post the update." };
  refresh();
  after(deliverQuietly);
  return { ok: true, comment: data };
}

/** Authors edit their own comments. Only the body can change. */
export async function editComment(commentId: string, body: string): Promise<ActionResult & { comment?: ItemComment }> {
  const parsed = Body.safeParse(body);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(commentId).success) return { error: "Invalid update." };

  const { supabase } = await session();
  const result = await supabase.from("item_comments").update({ body: parsed.data }).eq("id", commentId).select("*");
  if (refused(result, "")) return { error: result.error ? "Couldn't save the update." : "You can only edit your own updates." };
  refresh();
  after(deliverQuietly);
  return { ok: true, comment: (result.data as ItemComment[])[0] };
}

/** People delete their own comments; admins can delete anyone's. */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  if (!Id.safeParse(commentId).success) return { error: "Invalid update." };
  const { supabase } = await session();
  const result = await supabase.from("item_comments").delete().eq("id", commentId).select("id");
  if (refused(result, "")) return { error: result.error ? "Couldn't delete the update." : "You can only delete your own updates." };
  refresh();
  return { ok: true };
}
