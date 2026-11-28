import type { Dependency } from "./registers";
import type { Task } from "./types";

// Finish-to-start links between tasks. A link is broken (a conflict) when the
// successor starts on or before the day its predecessor is due, while both are
// still open. Mirrors dependency_conflicts() in the database.

export type Conflict = { dependencyId: string; predecessor: Task; successor: Task };

type Dated = Pick<Task, "id" | "status" | "start_date" | "due_date">;

export function isConflict(predecessor: Dated, successor: Dated) {
  if (predecessor.status === "done" || successor.status === "done") return false;
  const start = successor.start_date ?? successor.due_date;
  return !!predecessor.due_date && !!start && start <= predecessor.due_date;
}

export function findConflicts(tasks: Task[], deps: Dependency[]): Conflict[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: Conflict[] = [];
  for (const d of deps) {
    const predecessor = byId.get(d.predecessor_id);
    const successor = byId.get(d.successor_id);
    if (predecessor && successor && isConflict(predecessor, successor)) out.push({ dependencyId: d.id, predecessor, successor });
  }
  return out;
}

/**
 * The successors a date change would push into conflict: used to warn right
 * when someone moves a predecessor.
 */
export function newConflictsFrom(taskId: string, patch: Partial<Pick<Task, "start_date" | "due_date" | "status">>, tasks: Task[], deps: Dependency[]): Task[] {
  const before = new Set(findConflicts(tasks, deps).map((c) => c.dependencyId));
  const moved = tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
  return findConflicts(moved, deps)
    .filter((c) => !before.has(c.dependencyId))
    .map((c) => c.successor);
}

/** True when adding predecessor -> successor would make a loop. */
export function wouldCycle(predecessorId: string, successorId: string, deps: Dependency[]) {
  if (predecessorId === successorId) return true;
  const next = new Map<string, string[]>();
  for (const d of deps) next.set(d.predecessor_id, [...(next.get(d.predecessor_id) ?? []), d.successor_id]);
  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === predecessorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return false;
}
