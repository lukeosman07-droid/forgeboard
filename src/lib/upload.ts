"use client";

import { BUCKET, uploadProblem } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/types";
import { deleteAttachment, finishUpload, startUpload } from "@/server/files";

// Uploads one file straight to private storage (see src/server/files.ts for
// the three steps). Returns the saved attachment, or an error to show.
export async function uploadFile(
  file: File,
  target: { projectId: string; itemId?: string; documentId?: string },
): Promise<{ attachment?: Attachment; error?: string }> {
  const problem = uploadProblem(file);
  if (problem) return { error: problem };

  const started = await startUpload({ ...target, name: file.name, size: file.size });
  if (!started.upload) return { error: started.error ?? "Couldn't start the upload." };

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(started.upload.path, file, {
    contentType: started.upload.mimeType,
    upsert: false,
  });
  if (error) {
    // Free the quota it was holding.
    await deleteAttachment(started.upload.id);
    return { error: `${file.name} didn't upload. Please try again.` };
  }
  const finished = await finishUpload(started.upload.id);
  return finished.attachment ? { attachment: finished.attachment } : { error: finished.error ?? "Couldn't save the upload." };
}
