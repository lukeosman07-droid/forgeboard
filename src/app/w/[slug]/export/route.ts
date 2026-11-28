import { NextResponse, type NextRequest } from "next/server";
import { fileSlug, toCsv, zip } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { ITEM_COLUMNS, allRows, rowsToCsv, withSectionNames } from "@/server/export";
import { Slug } from "@/server/schemas";

// GET /w/<slug>/export -> the whole workspace as a ZIP of CSV files.
// Owners and admins only. Works while the workspace is read-only: data is never
// held hostage. (File attachments join the ZIP when uploads arrive in Phase 4.)
export async function GET(_request: NextRequest, { params }: RouteContext<"/w/[slug]/export">) {
  const { slug } = await params;
  if (!Slug.safeParse(slug).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getUser()) ?? { data: null };
  if (!supabase || !auth?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { data: workspace } = await supabase.from("workspaces").select("id, name").eq("slug", slug).maybeSingle<{ id: string; name: string }>();
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: role } = await supabase.rpc("workspace_role", { ws: workspace.id });
  if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Only owners and admins can export the workspace." }, { status: 403 });

  try {
    const ws = workspace.id;
    const [projects, sections, items, subtasks, comments, notes, people] = await Promise.all([
      allRows(supabase, "projects", "*", "workspace_id", ws),
      allRows(supabase, "sections", "*", "workspace_id", ws),
      allRows(supabase, "items", "*", "workspace_id", ws),
      allRows(supabase, "subtasks", "*", "workspace_id", ws),
      allRows(supabase, "item_comments", "*", "workspace_id", ws),
      allRows(supabase, "documents", "*", "workspace_id", ws),
      supabase.rpc("workspace_people", { ws }).then(({ data }) => (data ?? []) as Person[]),
    ]);
    // Phase 5 registers. Empty (not an error) if the migration hasn't run.
    const optional = (table: string) => allRows(supabase, table, "*", "workspace_id", ws).catch(() => [] as Record<string, unknown>[]);
    const [rfis, submittals, milestones, reviews, dependencies] = await Promise.all(
      ["rfis", "submittals", "milestones", "reviews", "item_dependencies"].map(optional),
    );

    const projectNames = new Map(projects.map((p) => [p.id as string, p.name as string]));
    const withProject = (rows: Record<string, unknown>[]) => rows.map((r) => ({ ...r, project: projectNames.get(r.project_id as string) ?? "" }));

    const archive = zip([
      { name: "README.txt", data: `Export of "${workspace.name}" from Forgeboard, ${new Date().toISOString()}.\r\nEach CSV has a header row. IDs link rows across files.\r\n` },
      { name: "projects.csv", data: rowsToCsv(projects, ["id", "name", "description", "color", "manager_id", "created_by", "created_at"]) },
      { name: "sections.csv", data: rowsToCsv(withProject(sections), ["id", "project_id", "project", "name", "position", "created_at"]) },
      { name: "items.csv", data: rowsToCsv(withProject(withSectionNames(items, sections)), ["project", ...ITEM_COLUMNS, "assignee_id", "source_document_id", "rfi_id", "submittal_id", "review_id", "disposition"]) },
      { name: "subtasks.csv", data: rowsToCsv(subtasks, ["id", "item_id", "title", "done", "position", "created_by", "created_at"]) },
      { name: "comments.csv", data: rowsToCsv(comments, ["id", "item_id", "body", "created_by", "created_at"]) },
      { name: "notes.csv", data: rowsToCsv(withProject(notes), ["id", "project_id", "project", "summary", "raw_text", "created_by", "created_at"]) },
      {
        name: "rfis.csv",
        data: rowsToCsv(withProject(rfis), ["id", "project_id", "project", "number", "subject", "question", "response", "status", "ball_in_court", "ball_in_court_id", "asked_by_id", "date_required", "opened_at", "answered_at", "closed_at", "source_item_id", "created_at"]),
      },
      {
        name: "submittals.csv",
        data: rowsToCsv(withProject(submittals), ["id", "project_id", "project", "number", "revision", "spec_section", "title", "description", "submitted_by", "reviewer", "reviewer_id", "received_on", "due_on", "returned_on", "action", "review_notes", "created_at"]),
      },
      { name: "milestones.csv", data: rowsToCsv(withProject(milestones), ["id", "project_id", "project", "number", "name", "due_on", "done_at", "created_at"]) },
      { name: "reviews.csv", data: rowsToCsv(withProject(reviews), ["id", "project_id", "project", "number", "name", "milestone_id", "due_on", "status", "closed_at", "created_at"]) },
      { name: "dependencies.csv", data: rowsToCsv(dependencies, ["id", "project_id", "predecessor_id", "successor_id", "created_at"]) },
      {
        name: "members.csv",
        data: toCsv(["user_id", "name", "email", "role", "joined_at"], people.map((p) => [p.user_id, p.full_name, p.email, p.role, p.joined_at])),
      },
    ]);

    return new NextResponse(archive as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileSlug(workspace.name, "workspace")}-export.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Workspace export failed:", err);
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
