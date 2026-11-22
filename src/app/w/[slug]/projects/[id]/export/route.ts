import { NextResponse, type NextRequest } from "next/server";
import { fileSlug } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";
import { ITEM_COLUMNS, allRows, rowsToCsv, withSectionNames } from "@/server/export";
import { Id } from "@/server/schemas";

// GET /w/<slug>/projects/<id>/export -> the project's tasks, decisions, risks
// and questions as one CSV. Anyone who can see the project can export it,
// including while the workspace is read-only.
export async function GET(_request: NextRequest, { params }: RouteContext<"/w/[slug]/projects/[id]/export">) {
  const { id } = await params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: user } = (await supabase?.auth.getUser()) ?? { data: null };
  if (!supabase || !user?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  // Row Level Security: a project the caller can't see isn't found.
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle<{ id: string; name: string }>();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const [sections, items] = await Promise.all([
      allRows(supabase, "sections", "id, name", "project_id", id),
      allRows(supabase, "items", "*", "project_id", id),
    ]);
    const csv = rowsToCsv(withSectionNames(items, sections), ITEM_COLUMNS);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileSlug(project.name, "project")}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Project export failed:", err);
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
