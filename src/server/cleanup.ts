// Daily cleanup from the cron job. It uses the service-role client because no
// user is signed in: it removes uploads that were started but never finished
// (the browser closed mid-upload), so they stop counting toward the quota.

import "server-only";
import { BUCKET } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

export async function removeStaleUploads(now: Date): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const before = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data, error } = await admin.rpc("stale_attachments", { p_before: before, p_limit: 500 });
  if (error) {
    console.error("stale_attachments failed:", error.message);
    return 0;
  }
  const rows = (data ?? []) as { id: string; storage_path: string }[];
  if (rows.length === 0) return 0;
  // A missing object is fine: the upload may never have started.
  await admin.storage.from(BUCKET).remove(rows.map((r) => r.storage_path));
  const { error: deleteError } = await admin.from("attachments").delete().in("id", rows.map((r) => r.id));
  if (deleteError) console.error("Removing stale uploads failed:", deleteError.message);
  return deleteError ? 0 : rows.length;
}
