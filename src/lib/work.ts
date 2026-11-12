import type { Item, ItemStatus, Priority, ProjectColor, Task } from "./types";

// Labels, colors and small helpers shared by every work view.

export const STATUSES: { id: ItemStatus; label: string; pill: string; dot: string; column: string }[] = [
  { id: "open", label: "To do", pill: "bg-slate-500/80 text-white", dot: "bg-slate-400", column: "border-t-slate-400" },
  { id: "in_progress", label: "Working on it", pill: "bg-amber-500 text-slate-950", dot: "bg-amber-400", column: "border-t-amber-400" },
  { id: "stuck", label: "Stuck", pill: "bg-rose-500 text-white", dot: "bg-rose-500", column: "border-t-rose-500" },
  { id: "done", label: "Done", pill: "bg-emerald-500 text-slate-950", dot: "bg-emerald-400", column: "border-t-emerald-400" },
];

export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<
  ItemStatus,
  (typeof STATUSES)[number]
>;

export const PRIORITIES: { id: Priority; label: string; pill: string; flag: string }[] = [
  { id: "urgent", label: "Urgent", pill: "bg-red-600 text-white", flag: "text-red-500" },
  { id: "high", label: "High", pill: "bg-orange-500 text-slate-950", flag: "text-orange-400" },
  { id: "medium", label: "Medium", pill: "bg-sky-500 text-slate-950", flag: "text-sky-400" },
  { id: "low", label: "Low", pill: "bg-slate-600 text-white", flag: "text-slate-400" },
];

export const PRIORITY_BY_ID = Object.fromEntries(PRIORITIES.map((p) => [p.id, p])) as Record<
  Priority,
  (typeof PRIORITIES)[number]
>;

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const PROJECT_COLORS: Record<ProjectColor, { dot: string; bar: string; soft: string; text: string }> = {
  orange: { dot: "bg-orange-500", bar: "bg-orange-500", soft: "bg-orange-500/15", text: "text-orange-300" },
  blue: { dot: "bg-blue-500", bar: "bg-blue-500", soft: "bg-blue-500/15", text: "text-blue-300" },
  green: { dot: "bg-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-500/15", text: "text-emerald-300" },
  purple: { dot: "bg-violet-500", bar: "bg-violet-500", soft: "bg-violet-500/15", text: "text-violet-300" },
  pink: { dot: "bg-pink-500", bar: "bg-pink-500", soft: "bg-pink-500/15", text: "text-pink-300" },
  teal: { dot: "bg-teal-500", bar: "bg-teal-500", soft: "bg-teal-500/15", text: "text-teal-300" },
  yellow: { dot: "bg-yellow-400", bar: "bg-yellow-400", soft: "bg-yellow-400/15", text: "text-yellow-300" },
  red: { dot: "bg-red-500", bar: "bg-red-500", soft: "bg-red-500/15", text: "text-red-300" },
};

export const COLOR_NAMES = Object.keys(PROJECT_COLORS) as ProjectColor[];

export function colorOf(color: string | null | undefined) {
  return PROJECT_COLORS[(color as ProjectColor) in PROJECT_COLORS ? (color as ProjectColor) : "orange"];
}

const AVATAR_COLORS = [
  "bg-sky-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-pink-600",
  "bg-amber-600",
  "bg-teal-600",
  "bg-indigo-600",
  "bg-rose-600",
];

export function avatarColor(name: string) {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export const isTask = (item: Pick<Item, "type">) => item.type === "action_item";

export function isOverdue(item: Pick<Item, "status" | "due_date">, today: string | null) {
  return !!today && !!item.due_date && item.status !== "done" && item.due_date < today;
}

// ---------------------------------------------------------------------------
// Plain dates (YYYY-MM-DD), handled in UTC so they never shift by time zone.
// ---------------------------------------------------------------------------

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export function weekdayShort(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function monthLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Due-date wording relative to today: "Today", "Tomorrow", "Yesterday", else "Nov 14". */
export function relativeDue(iso: string, today: string | null, format: (iso: string) => string) {
  if (!today) return format(iso);
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(iso);
}

// ---------------------------------------------------------------------------
// Rows from Supabase -> Task (with subtask and comment counts)
// ---------------------------------------------------------------------------

export const TASK_SELECT = "*, subtasks(done), item_comments(count)";

type RawTask = Item & { subtasks?: { done: boolean }[] | null; item_comments?: { count: number }[] | null };

export function toTask(row: RawTask): Task {
  const { subtasks, item_comments, ...item } = row;
  return {
    ...item,
    subtask_total: subtasks?.length ?? 0,
    subtask_done: subtasks?.filter((s) => s.done).length ?? 0,
    comment_count: item_comments?.[0]?.count ?? 0,
  };
}

/** Manual order first, then oldest first. */
export function byPosition(a: Pick<Item, "position" | "created_at">, b: Pick<Item, "position" | "created_at">) {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

/** Position for a card dropped between two neighbours (either may be missing). */
export function positionBetween(before?: number, after?: number) {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}
