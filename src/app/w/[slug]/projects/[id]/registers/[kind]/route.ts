import { NextResponse, type NextRequest } from "next/server";
import { fileSlug, toCsv } from "@/lib/export";
import { tablePdf, type PdfColumn } from "@/lib/pdf";
import { displayName } from "@/lib/people";
import { RFI_LOG_COLUMNS, SUBMITTAL_LOG_COLUMNS, rfiLogRow, submittalLogRow, type Rfi, type Submittal } from "@/lib/registers";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { allRows } from "@/server/export";
import { Id } from "@/server/schemas";

// GET /w/<slug>/projects/<id>/registers/<rfis|submittals>?format=csv|pdf
// The RFI or submittal log for a project. Anyone who can see the project can
// export it (Row Level Security filters the rows), even while read-only.

const RFI_PDF: PdfColumn[] = [
  { header: "RFI", width: 6 },
  { header: "Subject", width: 18 },
  { header: "Status", width: 7 },
  { header: "Ball in court", width: 10 },
  { header: "Asked by", width: 9 },
  { header: "Opened", width: 7.5 },
  { header: "Required", width: 7.5 },
  { header: "Answered", width: 7.5 },
  { header: "Days", width: 4.5 },
  { header: "Question", width: 24 },
];

const SUBMITTAL_PDF: PdfColumn[] = [
  { header: "No.", width: 5.5 },
  { header: "Rev", width: 3.5 },
  { header: "Spec", width: 7 },
  { header: "Title", width: 20 },
  { header: "From", width: 11 },
  { header: "Reviewer", width: 10 },
  { header: "Received", width: 7.5 },
  { header: "Due", width: 7.5 },
  { header: "Returned", width: 7.5 },
  { header: "Action", width: 11 },
  { header: "Notes", width: 18 },
];

export async function GET(request: NextRequest, { params }: RouteContext<"/w/[slug]/projects/[id]/registers/[kind]">) {
  const { id, kind } = await params;
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  if (!Id.safeParse(id).success || (kind !== "rfis" && kind !== "submittals")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const todayParam = request.nextUrl.searchParams.get("today") ?? "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: user } = (await supabase?.auth.getUser()) ?? { data: null };
  if (!supabase || !user?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { data: project } = await supabase.from("projects").select("id, name, workspace_id").eq("id", id).maybeSingle<{ id: string; name: string; workspace_id: string }>();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const label = kind === "rfis" ? "RFI log" : "Submittal log";
    const name = `${fileSlug(project.name, "project")}-${kind === "rfis" ? "rfi-log" : "submittal-log"}`;
    let headers: string[];
    let rows: string[][];
    let pdfRows: string[][];
    if (kind === "rfis") {
      const [rows_, people] = await Promise.all([
        allRows(supabase, "rfis", "*", "project_id", id),
        supabase.rpc("workspace_people", { ws: project.workspace_id }),
      ]);
      const rfis = rows_ as unknown as Rfi[];
      const names = new Map(((people.data ?? []) as Person[]).map((p) => [p.user_id, displayName(p)]));
      const sorted = [...rfis].sort((a, b) => a.number - b.number);
      headers = RFI_LOG_COLUMNS;
      rows = sorted.map((r) => rfiLogRow(r, r.asked_by_id ? (names.get(r.asked_by_id) ?? "Former member") : "", today));
      pdfRows = rows.map((r) => r.slice(0, 10));
    } else {
      const submittals = (await allRows(supabase, "submittals", "*", "project_id", id)) as unknown as Submittal[];
      headers = SUBMITTAL_LOG_COLUMNS;
      rows = [...submittals].sort((a, b) => a.number - b.number).map(submittalLogRow);
      pdfRows = rows;
    }

    if (format === "csv") {
      return new NextResponse(`\uFEFF${toCsv(headers, rows)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const pdf = tablePdf({
      title: `${project.name}: ${label}`,
      subtitle: `${rows.length} ${kind === "rfis" ? "RFI" : "submittal"}${rows.length === 1 ? "" : "s"} · exported ${today}`,
      columns: kind === "rfis" ? RFI_PDF : SUBMITTAL_PDF,
      rows: pdfRows,
    });
    return new NextResponse(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Register export failed:", err);
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
