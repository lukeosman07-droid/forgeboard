import type { Item, Section } from "./types";
import { daysBetween } from "./work";

// Saving a project as a custom template (Phase 5).

/** Sections and tasks to a template plan (at most 12 sections of 40 tasks, like PlanSchema). */
export function planFromProject(sections: Pick<Section, "id" | "name">[], items: Pick<Item, "title" | "details" | "priority" | "start_date" | "due_date" | "section_id">[]) {
  const dates = items.flatMap((i) => [i.start_date, i.due_date]).filter((d): d is string => !!d).sort();
  const origin = dates[0] ?? null;
  const toTask = (i: (typeof items)[number]) => {
    const start = i.start_date ?? i.due_date;
    const offset = origin && start ? Math.min(730, Math.max(0, daysBetween(origin, start))) : null;
    const length = start && i.due_date ? Math.min(365, Math.max(1, daysBetween(start, i.due_date) + 1)) : null;
    return {
      title: i.title.slice(0, 500),
      details: i.details?.slice(0, 5000) ?? null,
      priority: i.priority ?? null,
      start_offset: offset,
      duration_days: offset === null ? null : length,
    };
  };
  const groups = sections.map((s) => ({ name: s.name.slice(0, 120), tasks: items.filter((i) => i.section_id === s.id).map(toTask) }));
  const loose = items.filter((i) => !i.section_id || !sections.some((s) => s.id === i.section_id)).map(toTask);
  if (loose.length) groups.push({ name: "Other tasks", tasks: loose });
  const kept = groups.slice(0, 12).map((g) => ({ ...g, tasks: g.tasks.slice(0, 40) }));
  return { sections: kept.length ? kept : [{ name: "To do", tasks: [] }] };
}
