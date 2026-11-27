import { STATUS_BY_ID } from "@/lib/work";
import type { Item, Project, Section } from "@/lib/types";

/** A project's live tasks as plain text for the status and weekly reports. Capped at 40,000 characters. */
export function projectDataText(project: Pick<Project, "name" | "description">, sections: Section[], items: Item[], today: string): string {
  const tasks = items.filter((i) => i.type === "action_item");
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  return [
    `Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : "",
    "",
    "Tasks:",
    ...tasks.map((t) =>
      [
        `- ${t.title}`,
        `status: ${STATUS_BY_ID[t.status]?.label ?? t.status}`,
        t.section_id && sectionName.get(t.section_id) ? `section: ${sectionName.get(t.section_id)}` : "",
        t.assignee ? `owner: ${t.assignee}` : "owner: unassigned",
        t.due_date ? `due: ${t.due_date}${t.status !== "done" && t.due_date < today ? " (OVERDUE)" : ""}` : "",
        t.priority ? `priority: ${t.priority}` : "",
        t.completed_at ? `completed: ${t.completed_at.slice(0, 10)}${t.completed_at.slice(0, 10) >= weekAgo ? " (this week)" : ""}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    "",
    "Decisions made in the last week:",
    ...items.filter((i) => i.type === "decision" && i.created_at.slice(0, 10) >= weekAgo).map((i) => `- ${i.title}`),
    "",
    "Open risks and questions:",
    ...items.filter((i) => (i.type === "risk" || i.type === "question") && i.status !== "done").map((i) => `- (${i.type}) ${i.title}`),
  ]
    .join("\n")
    .slice(0, 40_000);
}

/** The Monday (UTC) of the week a moment falls in, as YYYY-MM-DD. */
export function weekOf(now: Date): string {
  const day = now.getUTCDay(); // 0 Sunday … 6 Saturday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}
