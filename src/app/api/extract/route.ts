import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isEmptyExtraction } from "@/lib/ai/clean";
import { MAX_SCANNED_BYTES, MAX_SCANNED_PAGES, extractFromDocument, extractFromScannedPdf, type ExtractResult } from "@/lib/ai/extract";
import { aiError as fail, claimAiUse, safeToday } from "@/lib/ai/usage";
import { BUCKET } from "@/lib/files";
import { MAX_NOTES_CHARS } from "@/lib/plans";

// A 40-page PDF is read in several parts; give it time.
export const maxDuration = 300;

const BodySchema = z
  .object({
    projectId: z.uuid(),
    /** Pasted notes. */
    text: z.string().optional(),
    /** Or a document: an uploaded file or a forwarded email. */
    documentId: z.uuid().optional(),
    // The browser's local date, so "by Friday" resolves in the user's time zone.
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((v) => (v.text === undefined) !== (v.documentId === undefined));

type DocumentRow = {
  id: string;
  project_id: string;
  origin: "paste" | "upload" | "email";
  raw_text: string;
  page_offsets: number[] | null;
  attachments: { storage_path: string; mime_type: string; size_bytes: number } | null;
};

// POST /api/extract  { projectId, text | documentId, today? }
// All checks happen here on the server; nothing from the browser is trusted.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request.");
  const { projectId, documentId } = parsed.data;
  const text = parsed.data.text?.trim();

  if (text !== undefined) {
    if (text.length < 20) return fail(400, "Paste some notes first (at least a sentence or two).");
    if (text.length > MAX_NOTES_CHARS) {
      return fail(413, `That's ${text.length.toLocaleString()} characters. The limit is ${MAX_NOTES_CHARS.toLocaleString()}; split it into smaller parts.`);
    }
  }

  // Row Level Security means these are only found if the user can see them.
  const supabase = await createClient();
  if (!supabase) return fail(401, "Please log in again.");
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspaces(id, slug)")
    .eq("id", projectId)
    .maybeSingle<{ id: string; workspaces: { id: string; slug: string } }>();
  if (!project) return fail(404, "Project not found.");

  let document: DocumentRow | null = null;
  if (documentId) {
    const { data } = await supabase
      .from("documents")
      .select("id, project_id, origin, raw_text, page_offsets, attachments!documents_attachment_id_fkey(storage_path, mime_type, size_bytes)")
      .eq("id", documentId)
      .eq("project_id", projectId)
      .maybeSingle<DocumentRow>();
    if (!data) return fail(404, "Document not found.");
    document = data;
    // Reading files and email is a paid feature.
    if (document.origin !== "paste") {
      const { data: limits } = await supabase.rpc("workspace_limits", { ws: project.workspaces.id });
      if (!limits?.[0]?.file_ai) {
        return fail(402, "Reading files and email with AI is on the Team and Business plans.", { code: "plan", upgradeUrl: `/w/${project.workspaces.slug}/billing` });
      }
    }
  }

  const claim = await claimAiUse(project.workspaces, user.id, "extract");
  if (!claim.ok) return claim.response;

  const today = safeToday(parsed.data.today);
  let result: ExtractResult;
  if (document && !document.raw_text.trim() && document.attachments?.mime_type === "application/pdf") {
    result = await readScan(supabase, document.attachments, today);
  } else {
    result = await extractFromDocument({
      text: document?.raw_text ?? text!,
      pageOffsets: document?.page_offsets ?? null,
      today,
    });
  }

  if (!result.ok) {
    await claim.finish("failed", result.usage); // errors don't use up a run
    return fail(result.status, result.error);
  }
  if (isEmptyExtraction(result.data)) {
    await claim.finish("empty", result.usage);
    return fail(422, "The AI didn't find any action items, decisions, risks, or questions in that text. Try fuller notes.", {
      code: "nothing_found",
    });
  }

  await claim.finish("succeeded", result.usage);
  return NextResponse.json({ extraction: result.data, runsLeft: claim.runsLeft, documentId: document?.id ?? null });
}

/** A scanned PDF: the model reads the pages. */
async function readScan(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  file: NonNullable<DocumentRow["attachments"]>,
  today: string,
): Promise<ExtractResult> {
  if (file.size_bytes > MAX_SCANNED_BYTES) {
    return { ok: false, status: 413, error: "This PDF is a scan with no text, and it's too big for the AI to read (20 MB max for scans)." };
  }
  const { data: blob } = await supabase.storage.from(BUCKET).download(file.storage_path);
  if (!blob) return { ok: false, status: 502, error: "Couldn't open the file. Please try again." };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_SCANNED_PAGES) {
    return { ok: false, status: 413, error: `This PDF is a scan with no text, and has ${pdf.numPages} pages. The AI can read scans of up to ${MAX_SCANNED_PAGES} pages.` };
  }
  return extractFromScannedPdf(bytes.toString("base64"), pdf.numPages, today);
}
