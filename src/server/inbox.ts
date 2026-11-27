"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { inboxAddress } from "@/lib/inbound";
import { Id, type ActionResult } from "./schemas";
import { NO_ACCESS, isDenied, refused, session } from "./session";

// The project's inbox address. Only people who can add work to the project
// see it; the project's manager (or an admin) decides who may send to it.

export type InboxInfo = {
  /** Null until the inbox is turned on. */
  address: string | null;
  enabled: boolean;
  /** True when INBOUND_EMAIL_DOMAIN isn't set, so there's no address to show yet. */
  needsSetup: boolean;
  allowOutsideSenders: boolean;
};

export async function getInbox(projectId: string): Promise<InboxInfo | null> {
  if (!Id.safeParse(projectId).success) return null;
  const { supabase } = await session();
  const { data } = await supabase
    .from("project_inboxes")
    .select("token, allow_outside_senders")
    .eq("project_id", projectId)
    .maybeSingle<{ token: string; allow_outside_senders: boolean }>();
  return {
    enabled: !!data,
    address: data ? inboxAddress(data.token) : null,
    needsSetup: !process.env.INBOUND_EMAIL_DOMAIN,
    allowOutsideSenders: data?.allow_outside_senders ?? false,
  };
}

export async function enableInbox(projectId: string): Promise<ActionResult & { inbox?: InboxInfo }> {
  if (!Id.safeParse(projectId).success) return { error: "Project not found." };
  const { supabase } = await session();
  const { error } = await supabase.from("project_inboxes").insert({ project_id: projectId });
  if (error && error.code !== "23505") {
    return { error: isDenied(error) ? "The project inbox is on the Team and Business plans, for people who can edit the project." : "Couldn't turn on the inbox." };
  }
  refresh();
  return { ok: true, inbox: (await getInbox(projectId)) ?? undefined };
}

export async function setOutsideSenders(projectId: string, allow: boolean): Promise<ActionResult> {
  const parsed = z.object({ projectId: Id, allow: z.boolean() }).safeParse({ projectId, allow });
  if (!parsed.success) return { error: "Invalid change." };
  const { supabase } = await session();
  const problem = refused(
    await supabase.from("project_inboxes").update({ allow_outside_senders: allow }).eq("project_id", projectId).select("project_id"),
    "Couldn't change the inbox.",
  );
  if (problem) return { error: problem === NO_ACCESS ? "Only the project's manager or an admin can change who may email in." : problem };
  refresh();
  return { ok: true };
}

/** A new address; the old one stops working at once. */
export async function newInboxAddress(projectId: string): Promise<ActionResult & { inbox?: InboxInfo }> {
  if (!Id.safeParse(projectId).success) return { error: "Project not found." };
  const { supabase } = await session();
  const token = crypto.randomUUID().replaceAll("-", "");
  const problem = refused(
    await supabase.from("project_inboxes").update({ token }).eq("project_id", projectId).select("project_id"),
    "Couldn't change the address.",
  );
  if (problem) return { error: problem === NO_ACCESS ? "Only the project's manager or an admin can change the address." : problem };
  refresh();
  return { ok: true, inbox: (await getInbox(projectId)) ?? undefined };
}
