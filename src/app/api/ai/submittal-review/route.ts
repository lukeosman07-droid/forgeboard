import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { reviewSubmittal, type SubmittalSource } from "@/lib/ai/registers";
import { aiError as fail, claimAiUse } from "@/lib/ai/usage";
import { BUCKET } from "@/lib/files";
import { readFileText } from "@/lib/read-file";
import { createClient } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/types";

export const maxDuration = 300;

const BodySchema = z.object({
  submittalId: z.uuid(),
  attachmentId: z.uuid(),
  spec: z.string().trim().min(40, "Paste the spec section (at least a few lines).").max(60000, "That spec text is too long (60,000 characters max)."),
});

/** Scanned PDFs go to the model as a document; keep them to a size it accepts. */
const MAX_SCAN_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 300_000;

// POST /api/ai/submittal-review  { submittalId, attachmentId, spec } -> { review }
// Reads a PDF (or Word) file attached to the submittal and lists where it may
// not meet the pasted spec. The reviewer confirms each item; nothing is saved
// here. Needs registers and file AI on the plan.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");

  const supabase = await createClient();
  if (!supabase) return fail(401, "Please log in again.");
  const { data: submittal } = await supabase
    .from("submittals")
    .select("id, title, workspace_id, workspaces(id, slug)")
    .eq("id", parsed.data.submittalId)
    .maybeSingle<{ id: string; title: string; workspace_id: string; workspaces: { id: string; slug: string } | null }>();
  if (!submittal?.workspaces) return fail(404, "Submittal not found.");
  const { data: limits } = await supabase.rpc("workspace_limits", { ws: submittal.workspace_id });
  if (!limits?.[0]?.registers || !limits?.[0]?.file_ai) {
    return fail(402, "AI submittal review is on the Team and Business plans.", { code: "upgrade", upgradeUrl: `/w/${submittal.workspaces.slug}/billing` });
  }

  const { data: file } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", parsed.data.attachmentId)
    .eq("submittal_id", submittal.id)
    .eq("status", "ready")
    .maybeSingle<Attachment>();
  if (!file) return fail(404, "That file isn't attached to this submittal.");
  if (file.mime_type !== "application/pdf" && !file.mime_type.includes("wordprocessingml")) return fail(400, "The AI can review PDF or Word (DOCX) submittals.");

  const { data: blob } = await supabase.storage.from(BUCKET).download(file.storage_path);
  if (!blob) return fail(502, "Couldn't open the file. Please try again.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let source: SubmittalSource;
  try {
    const read = await readFileText(bytes, file.mime_type);
    if (read.scanned) {
      if (bytes.byteLength > MAX_SCAN_BYTES) return fail(413, "That scanned PDF is too large for the AI to read. Split it into smaller files.");
      source = { kind: "pdf", base64: Buffer.from(bytes).toString("base64") };
    } else {
      if (read.text.trim().length < 40) return fail(422, `${file.name} has no text the AI can read.`);
      source = { kind: "text", text: read.text.slice(0, MAX_TEXT_CHARS) };
    }
  } catch (error) {
    console.error("Reading a submittal failed:", error);
    return fail(422, `Couldn't read ${file.name}. Is it a valid, unlocked file?`);
  }

  const claim = await claimAiUse(submittal.workspaces, user.id, "submittal_review");
  if (!claim.ok) return claim.response;
  const result = await reviewSubmittal(parsed.data.spec, source, submittal.title);
  if (!result.ok) {
    await claim.finish("failed", result.usage);
    return fail(result.status, result.error);
  }
  await claim.finish(result.data.deviations.length || result.data.summary ? "succeeded" : "empty", result.usage);
  return NextResponse.json({ review: result.data, file: file.name, runsLeft: claim.runsLeft });
}
