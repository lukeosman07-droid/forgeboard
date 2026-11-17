import type { PlanOutput } from "./assist-schema";
import type { Extraction } from "./schema";

// Server-side guardrails applied to whatever the AI returns, on top of the prompt.
// Plain functions with no server imports, so they can be unit tested.

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Cleans an extraction: drops blank rows, dates that aren't real dates, and
 * owners whose name doesn't appear anywhere in the original text.
 */
export function cleanExtraction(data: Extraction, text: string): Extraction {
  const haystack = text.toLowerCase();
  const nameInText = (name: string) =>
    name
      .toLowerCase()
      .split(/[\s,.;()]+/)
      .filter((part) => part.length >= 2)
      .some((part) => haystack.includes(part));

  return {
    summary: data.summary.trim(),
    action_items: data.action_items
      .filter((a) => a.title.trim())
      .map((a) => {
        const assignee = a.assignee.trim();
        return {
          ...a,
          title: a.title.trim(),
          assignee: assignee && assignee.toLowerCase() !== "unassigned" && nameInText(assignee) ? assignee : "Unassigned",
          due_date: isIsoDate(a.due_date) ? a.due_date : null,
        };
      }),
    decisions: data.decisions.filter((d) => d.title.trim()),
    risks: data.risks.filter((r) => r.title.trim()),
    questions: data.questions.filter((q) => q.question.trim()),
  };
}

export function isEmptyExtraction(data: Extraction) {
  return data.action_items.length + data.decisions.length + data.risks.length + data.questions.length === 0;
}

/** Clamps an AI project plan to the sizes and ranges the app accepts. */
export function clampPlan(data: PlanOutput): PlanOutput {
  return {
    sections: data.sections
      .filter((s) => s.name.trim())
      .slice(0, 12)
      .map((s) => ({
        name: s.name.trim().slice(0, 120),
        tasks: s.tasks
          .filter((t) => t.title.trim())
          .slice(0, 40)
          .map((t) => ({
            ...t,
            title: t.title.trim().slice(0, 500),
            details: t.details.trim().slice(0, 5000),
            start_offset: Math.min(Math.max(Math.round(t.start_offset), 0), 730),
            duration_days: Math.min(Math.max(Math.round(t.duration_days), 1), 365),
          })),
      })),
  };
}
