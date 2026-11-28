import { addDays, startOfWeek } from "./work";

// Turns rows from the database's workload() function into a grid: people down
// the side, Overdue / each week / No date across.

export type WorkloadRow = {
  person_key: string;
  person_id: string | null;
  person_name: string | null;
  bucket: "overdue" | "week" | "none";
  week_start: string | null;
  open_count: number;
  overdue_count: number;
};

export type WorkloadCell = { open: number; overdue: number };

export type WorkloadPerson = {
  key: string;
  id: string | null;
  name: string;
  overdue: WorkloadCell;
  weeks: WorkloadCell[];
  noDate: WorkloadCell;
  total: number;
};

export type WorkloadGrid = { weeks: string[]; people: WorkloadPerson[] };

const empty = (): WorkloadCell => ({ open: 0, overdue: 0 });

export function workloadGrid(rows: WorkloadRow[], today: string, weekCount: number): WorkloadGrid {
  const monday = startOfWeek(today);
  const weeks = Array.from({ length: weekCount }, (_, i) => addDays(monday, i * 7));
  const people = new Map<string, WorkloadPerson>();
  for (const r of rows) {
    let p = people.get(r.person_key);
    if (!p) {
      p = {
        key: r.person_key,
        id: r.person_id,
        name: r.person_name ?? "Unassigned",
        overdue: empty(),
        weeks: weeks.map(empty),
        noDate: empty(),
        total: 0,
      };
      people.set(r.person_key, p);
    }
    const cell =
      r.bucket === "overdue" ? p.overdue : r.bucket === "none" ? p.noDate : p.weeks[weeks.indexOf((r.week_start ?? "").slice(0, 10))];
    if (!cell) continue;
    cell.open += r.open_count;
    cell.overdue += r.overdue_count;
    p.total += r.open_count;
  }
  const sorted = [...people.values()].sort((a, b) => {
    if ((a.key === "none") !== (b.key === "none")) return a.key === "none" ? 1 : -1; // Unassigned last
    if (!!a.id !== !!b.id) return a.id ? -1 : 1; // members before plain names
    return a.name.localeCompare(b.name);
  });
  return { weeks, people: sorted };
}

/** Background for a cell by how many open tasks it holds. */
export function loadLevel(open: number): "none" | "light" | "medium" | "heavy" {
  if (open === 0) return "none";
  if (open <= 3) return "light";
  if (open <= 6) return "medium";
  return "heavy";
}
