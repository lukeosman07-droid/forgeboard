import type { Activity } from "./types";
import { formatDate } from "./dates";
import { PRIORITY_BY_ID, STATUS_BY_ID } from "./work";

// Turns activity rows (written by database triggers) into short sentences:
// "changed the due date from Nov 3 to Nov 5".

export type ActivityLookups = {
  /** A person's current name by user ID. */
  personName: (id: string) => string | null;
  /** A section's name by ID. */
  sectionName: (id: string) => string | null;
};

const TYPE_LABELS: Record<string, string> = { action_item: "task", decision: "decision", risk: "risk", question: "question" };

function quote(text: string, max = 60) {
  const t = text.replace(/\s+/g, " ").trim();
  return `“${t.length > max ? `${t.slice(0, max)}…` : t}”`;
}

function show(field: string, value: unknown, lookups: ActivityLookups): string {
  if (value === null || value === undefined || value === "") return "none";
  const v = String(value);
  switch (field) {
    case "status":
      return STATUS_BY_ID[v as keyof typeof STATUS_BY_ID]?.label ?? v;
    case "priority":
      return PRIORITY_BY_ID[v as keyof typeof PRIORITY_BY_ID]?.label ?? v;
    case "start_date":
    case "due_date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v;
    case "section_id":
      return lookups.sectionName(v) ?? "another section";
    case "type":
      return TYPE_LABELS[v] ?? v;
    default:
      return quote(v);
  }
}

const FIELD_LABELS: Record<string, string> = {
  title: "the name",
  status: "the status",
  priority: "the priority",
  start_date: "the start date",
  due_date: "the due date",
  section_id: "the section",
  type: "the type",
};

/** One phrase per changed field, without the actor: "changed the due date from Nov 3 to Nov 5". */
export function describeChanges(changes: Activity["changes"], lookups: ActivityLookups): string[] {
  if (!changes) return [];
  const out: string[] = [];
  const owner = (side: "old" | "new") => {
    const id = changes.assignee_id?.[side];
    if (typeof id === "string") return lookups.personName(id) ?? (changes.assignee?.[side] as string | null) ?? "someone";
    const text = changes.assignee?.[side];
    return typeof text === "string" && text ? text : null;
  };

  for (const [field, change] of Object.entries(changes)) {
    if (field === "assignee" && changes.assignee_id) continue; // described with assignee_id
    if (field === "assignee" || field === "assignee_id") {
      const before = owner("old");
      const after = owner("new");
      out.push(after ? (before ? `changed the owner from ${before} to ${after}` : `assigned it to ${after}`) : `removed the owner${before ? ` (${before})` : ""}`);
      continue;
    }
    if (field === "details") {
      out.push(change.new ? (change.old ? "edited the description" : "added a description") : "removed the description");
      continue;
    }
    const label = FIELD_LABELS[field] ?? field.replace(/_/g, " ");
    if (change.new === null || change.new === undefined || change.new === "") {
      out.push(`cleared ${label}`);
    } else if (change.old === null || change.old === undefined || change.old === "") {
      out.push(`set ${label} to ${show(field, change.new, lookups)}`);
    } else {
      out.push(`changed ${label} from ${show(field, change.old, lookups)} to ${show(field, change.new, lookups)}`);
    }
  }
  return out;
}

/** The whole line minus the actor: "created this task", "commented", ... */
export function describeActivity(entry: Pick<Activity, "verb" | "changes" | "item_title">, lookups: ActivityLookups, withTitle = false): string {
  const title = withTitle && entry.item_title ? ` ${quote(entry.item_title, 50)}` : "";
  switch (entry.verb) {
    case "created":
      return withTitle ? `created${title}` : "created this";
    case "deleted":
      return `deleted${title || " this"}`;
    case "commented":
      return `commented${title ? ` on${title}` : ""}`;
    case "comment_edited":
      return `edited a comment${title ? ` on${title}` : ""}`;
    case "comment_deleted":
      return `deleted a comment${title ? ` on${title}` : ""}`;
    case "updated": {
      const parts = describeChanges(entry.changes, lookups);
      const text = parts.length ? parts.join(", ") : "made a change";
      return withTitle ? `${text} on${title}` : text;
    }
  }
}

/** "just now", "5m ago", "3h ago", "Nov 5". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.round(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
