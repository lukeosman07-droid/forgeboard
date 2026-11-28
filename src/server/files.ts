"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { BUCKET, MAX_UPLOAD_BYTES, canCapture, uploadProblem, uploadTypeFor } from "@/lib/files";
import { readFileText } from "@/lib/read-file";
import type { Attachment } from "@/lib/types";
import { Id, firstIssue, type ActionResult } from "./schemas";
import { NO_ACCESS, isDenied, refused, session } from "./session";

// Uploads go straight from the browser to private storage (Vercel can't take
// a 25 MB request body), in three steps:
//   1. startUpload() records the attachment. The database checks the file
//      type, size, quota and upload rate, and picks the storage path.
//   2. The browser uploads to that path. Storage only accepts it because a
//      pending attachment by this person exists for it.
//   3. finishUpload() checks the file arrived and marks it ready.
// The quota counts from step 1, so a half-finished upload can't overfill it.

const StartUpload = z
  .object({
    projectId: Id,
    itemId: Id.optional(),
    documentId: Id.optional(),
    rfiId: Id.optional(),
    submittalId: Id.optional(),
    name: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Files can be up to 25 MB."),
  })
  .refine((v) => [v.itemId, v.documentId, v.rfiId, v.submittalId].filter(Boolean).length <= 1, "Attach the file to one thing at a time.");

export type StartedUpload = { id: string; path: string; mimeType: string };

export async function startUpload(input: z.input<typeof StartUpload>): Promise<ActionResult & { upload?: StartedUpload }> {
  const parsed = StartUpload.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const problem = uploadProblem(parsed.data);
  if (problem) return { error: problem };

  const { supabase } = await session();
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      project_id: parsed.data.projectId,
      item_id: parsed.data.itemId ?? null,
      document_id: parsed.data.documentId ?? null,
      rfi_id: parsed.data.rfiId ?? null,
      submittal_id: parsed.data.submittalId ?? null,
      name: parsed.data.name,
      size_bytes: parsed.data.size,
      mime_type: uploadTypeFor(parsed.data.name),
    })
    .select("id, storage_path, mime_type")
    .single<{ id: string; storage_path: string; mime_type: string }>();
  if (error || !data) return { error: uploadError(error) };
  return { ok: true, upload: { id: data.id, path: data.storage_path, mimeType: data.mime_type } };
}

function uploadError(error: { message?: string; hint?: string } | null): string {
  if (error?.message?.includes("storage_quota_exceeded")) {
    return error.hint || "This upload would go over your plan's storage. Delete some files or upgrade.";
  }
  if (error?.message?.includes("upload_rate_limited")) {
    return error.hint || "You've uploaded a lot of files in the last hour. Please wait a little and try again.";
  }
  if (isDenied(error)) return NO_ACCESS;
  return "Couldn't start the upload. Please try again.";
}

export async function finishUpload(attachmentId: string): Promise<ActionResult & { attachment?: Attachment }> {
  if (!Id.safeParse(attachmentId).success) return { error: "Upload not found." };
  const { supabase } = await session();
  const { data: row } = await supabase.from("attachments").select("*").eq("id", attachmentId).maybeSingle<Attachment>();
  if (!row) return { error: "Upload not found." };

  const { data: info } = await supabase.storage.from(BUCKET).info(row.storage_path);
  if (!info || (typeof info.size === "number" && info.size !== row.size_bytes)) {
    return { error: "The file didn't finish uploading. Please try again." };
  }
  const { data, error } = await supabase.from("attachments").update({ status: "ready" }).eq("id", attachmentId).select("*");
  const problem = refused({ data, error }, "Couldn't save the upload.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true, attachment: (data as Attachment[])[0] };
}

/** Removes the file from storage, then its record (which frees the quota). */
export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  if (!Id.safeParse(attachmentId).success) return { error: "File not found." };
  const { supabase } = await session();
  const { data: row } = await supabase.from("attachments").select("id, storage_path").eq("id", attachmentId).maybeSingle();
  if (!row) return { error: "File not found." };
  const removed = await supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (removed.error) return { error: "Couldn't delete the file. Please try again." };
  const problem = refused(await supabase.from("attachments").delete().eq("id", attachmentId).select("id"), "Couldn't delete the file.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export async function listAttachments(parent: { itemId?: string; documentId?: string; rfiId?: string; submittalId?: string }): Promise<Attachment[]> {
  const parsed = z
    .object({ itemId: Id.optional(), documentId: Id.optional(), rfiId: Id.optional(), submittalId: Id.optional() })
    .safeParse(parent);
  if (!parsed.success) return [];
  const { itemId, documentId, rfiId, submittalId } = parsed.data;
  const [column, value] = itemId
    ? ["item_id", itemId]
    : documentId
      ? ["document_id", documentId]
      : rfiId
        ? ["rfi_id", rfiId]
        : submittalId
          ? ["submittal_id", submittalId]
          : [null, null];
  if (!column || !value) return [];
  const { supabase } = await session();
  const query = supabase.from("attachments").select("*").eq("status", "ready").eq(column, value);
  const { data } = await query.order("created_at", { ascending: false });
  return (data ?? []) as Attachment[];
}

export type CapturedDocument = {
  id: string;
  title: string;
  pageCount: number | null;
  /** A scan with no text layer: the AI reads the PDF's pages as images. */
  scanned: boolean;
  chars: number;
};

/**
 * Reads an uploaded file (PDF, Word, email or transcript) into a document the
 * AI can extract from. Needs a plan with file AI; the database checks that too.
 */
export async function documentFromUpload(attachmentId: string): Promise<ActionResult & { document?: CapturedDocument }> {
  if (!Id.safeParse(attachmentId).success) return { error: "File not found." };
  const { supabase } = await session();
  const { data: file } = await supabase.from("attachments").select("*").eq("id", attachmentId).eq("status", "ready").maybeSingle<Attachment>();
  if (!file) return { error: "File not found." };
  if (!canCapture(file.name)) return { error: "The AI can read PDF, Word (DOCX), email (EML) and text or transcript (TXT, VTT, SRT) files." };

  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(file.storage_path);
  if (downloadError || !blob) return { error: "Couldn't open the file. Please try again." };

  let read;
  try {
    read = await readFileText(new Uint8Array(await blob.arrayBuffer()), file.mime_type);
  } catch (error) {
    console.error("Reading an upload failed:", error);
    return { error: `Couldn't read ${file.name}. Is it a valid, unlocked file?` };
  }
  if (!read.scanned && read.text.trim().length < 20) return { error: `${file.name} has no text the AI can read.` };

  const title = (read.title || file.name).slice(0, 300);
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      project_id: file.project_id,
      origin: "upload",
      title,
      raw_text: read.text,
      page_offsets: read.pageOffsets,
      attachment_id: file.id,
      email_from: read.from ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !doc) {
    return { error: isDenied(error) ? "Reading files with AI isn't included in your plan. Upgrade to Team or Business." : "Couldn't save the document." };
  }
  await supabase.from("attachments").update({ document_id: doc.id }).eq("id", file.id);
  return {
    ok: true,
    document: { id: doc.id, title, pageCount: read.pageCount, scanned: read.scanned, chars: read.text.length },
  };
}

/** Emails that arrived in the project's inbox, newest first, for the capture panel. */
export type InboxDocument = { id: string; title: string | null; email_from: string | null; created_at: string; captured_at: string | null; chars: number };

export async function listInboxDocuments(projectId: string): Promise<InboxDocument[]> {
  if (!Id.safeParse(projectId).success) return [];
  const { supabase } = await session();
  const { data } = await supabase
    .from("documents")
    .select("id, title, email_from, created_at, captured_at, raw_text")
    .eq("project_id", projectId)
    .eq("origin", "email")
    .order("created_at", { ascending: false })
    .limit(30);
  type Row = Omit<InboxDocument, "chars"> & { raw_text: string };
  return ((data ?? []) as Row[]).map(({ raw_text, ...d }) => ({ ...d, chars: raw_text.length }));
}
