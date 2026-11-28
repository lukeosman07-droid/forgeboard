import type { ItemStatus, Priority, Task } from "./types";
import { PRIORITY_RANK, addDays, byPosition, startOfWeek } from "./work";

// Filters and sort for a project's task views (table, board, calendar,
// timeline). They live in the address bar, so a refresh, a shared link or a
// saved view (which stores the same query string) shows the same tasks.

export type DueFilter = "" | "overdue" | "today" | "week" | "next_week" | "none";
export type SortKey = "manual" | "due" | "start" | "priority" | "status" | "owner" | "title" | "created";

export type Filters = {
  search: string;
  /** Owner name, or "__none" for unassigned. */
  owner: string;
  status: ItemStatus[];
  priority: (Priority | "none")[];
  /** Section ID, or "__none". */
  section: string;
  due: DueFilter;
  hideDone: boolean;
  sort: SortKey;
  desc: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  search: "",
  owner: "",
  status: [],
  priority: [],
  section: "",
  due: "",
  hideDone: false,
  sort: "manual",
  desc: false,
};

const STATUSES: ItemStatus[] = ["open", "in_progress", "stuck", "done"];
const PRIORITIES: (Priority | "none")[] = ["urgent", "high", "medium", "low", "none"];
const DUES: DueFilter[] = ["overdue", "today", "week", "next_week", "none"];
const SORTS: SortKey[] = ["manual", "due", "start", "priority", "status", "owner", "title", "created"];

export const DUE_LABELS: Record<Exclude<DueFilter, "">, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "Due this week",
  next_week: "Due next week",
  none: "No due date",
};

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual order",
  due: "Due date",
  start: "Start date",
  priority: "Priority",
  status: "Status",
  owner: "Owner",
  title: "Name",
  created: "Date added",
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: Params, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function list<T extends string>(raw: string, allowed: readonly T[]): T[] {
  const seen = new Set<T>();
  for (const part of raw.split(",")) if ((allowed as readonly string[]).includes(part)) seen.add(part as T);
  return allowed.filter((a) => seen.has(a));
}

/** Reads filters from a URL's query. Unknown values are ignored. */
export function parseFilters(params: Params): Filters {
  const due = read(params, "due") as DueFilter;
  const sort = read(params, "sort") as SortKey;
  return {
    search: read(params, "q").slice(0, 200),
    owner: read(params, "owner").slice(0, 200),
    status: list(read(params, "status"), STATUSES),
    priority: list(read(params, "priority"), PRIORITIES),
    section: read(params, "section").slice(0, 60),
    due: DUES.includes(due) ? due : "",
    hideDone: read(params, "done") === "hide",
    sort: SORTS.includes(sort) ? sort : "manual",
    desc: read(params, "dir") === "desc",
  };
}

/** The query string for a set of filters (defaults left out), e.g. "status=open,stuck&sort=due". */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.owner) p.set("owner", f.owner);
  if (f.status.length) p.set("status", STATUSES.filter((s) => f.status.includes(s)).join(","));
  if (f.priority.length) p.set("priority", PRIORITIES.filter((s) => f.priority.includes(s)).join(","));
  if (f.section) p.set("section", f.section);
  if (f.due) p.set("due", f.due);
  if (f.hideDone) p.set("done", "hide");
  if (f.sort !== "manual") p.set("sort", f.sort);
  if (f.desc && f.sort !== "manual") p.set("dir", "desc");
  return p.toString();
}

export const FILTER_KEYS = ["q", "owner", "status", "priority", "section", "due", "done", "sort", "dir"];

/** True when any filter narrows the list (sorting alone doesn't count). */
export function isFiltering(f: Filters) {
  return !!(f.search.trim() || f.owner || f.status.length || f.priority.length || f.section || f.due || f.hideDone);
}

function matchesDue(t: Pick<Task, "due_date" | "status">, due: DueFilter, today: string | null) {
  if (!due) return true;
  if (due === "none") return !t.due_date;
  if (!t.due_date || !today) return false;
  if (due === "overdue") return t.status !== "done" && t.due_date < today;
  if (due === "today") return t.due_date === today;
  const monday = startOfWeek(today);
  if (due === "week") return t.due_date >= monday && t.due_date <= addDays(monday, 6);
  return t.due_date >= addDays(monday, 7) && t.due_date <= addDays(monday, 13);
}

/** The tasks that match every filter, in the chosen order. */
export function applyFilters(tasks: Task[], f: Filters, today: string | null): Task[] {
  const q = f.search.trim().toLowerCase();
  const kept = tasks.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q) || !!t.assignee?.toLowerCase().includes(q) || !!t.details?.toLowerCase().includes(q)) &&
      (!f.owner || (f.owner === "__none" ? !t.assignee : t.assignee?.toLowerCase() === f.owner.toLowerCase())) &&
      (!f.status.length || f.status.includes(t.status)) &&
      (!f.priority.length || f.priority.includes(t.priority ?? "none")) &&
      (!f.section || (f.section === "__none" ? !t.section_id : t.section_id === f.section)) &&
      matchesDue(t, f.due, today) &&
      (!f.hideDone || t.status !== "done"),
  );
  return sortTasks(kept, f.sort, f.desc);
}

const STATUS_RANK: Record<ItemStatus, number> = { stuck: 0, in_progress: 1, open: 2, done: 3 };

/** Sorts a copy. Empty values (no date, no owner) always go last. */
export function sortTasks(tasks: Task[], sort: SortKey, desc = false): Task[] {
  if (sort === "manual") return [...tasks].sort(byPosition);
  const value = (t: Task): string | number | null => {
    switch (sort) {
      case "due":
        return t.due_date;
      case "start":
        return t.start_date;
      case "priority":
        return t.priority ? PRIORITY_RANK[t.priority] : null;
      case "status":
        return STATUS_RANK[t.status];
      case "owner":
        return t.assignee?.toLowerCase() || null;
      case "title":
        return t.title.toLowerCase();
      case "created":
        return t.created_at;
    }
  };
  return [...tasks].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? byPosition(a, b) : va === null ? 1 : -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return (desc ? -cmp : cmp) || byPosition(a, b);
  });
}
