import { describe, expect, it } from "vitest";
import type { PlanOutput } from "@/lib/ai/assist-schema";
import { clampPlan, cleanExtraction, isEmptyExtraction, isIsoDate } from "@/lib/ai/clean";
import type { Extraction } from "@/lib/ai/schema";

const NOTES = "Dev to finalize the one-line by Friday. Sam needs pump curves. Decision: use VFD pumps.";

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return { summary: " A summary. ", action_items: [], decisions: [], risks: [], questions: [], ...overrides };
}

function action(overrides: Partial<Extraction["action_items"][number]> = {}) {
  return { title: "Finalize one-line", assignee: "Dev", due_date: "2026-11-20", priority: "high" as const, source_quote: "q", source_page: null as number | null, ...overrides };
}

describe("isIsoDate", () => {
  it("accepts real dates", () => {
    expect(isIsoDate("2026-11-20")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible or badly formatted dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("11/20/2026")).toBe(false);
    expect(isIsoDate("next Friday")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("cleanExtraction", () => {
  it("trims the summary and titles", () => {
    const out = cleanExtraction(extraction({ action_items: [action({ title: "  Finalize one-line  " })] }), NOTES);
    expect(out.summary).toBe("A summary.");
    expect(out.action_items[0].title).toBe("Finalize one-line");
  });

  it("keeps an owner whose name appears in the notes", () => {
    const out = cleanExtraction(extraction({ action_items: [action({ assignee: "Dev" }), action({ assignee: "Sam Rivera" })] }), NOTES);
    expect(out.action_items.map((a) => a.assignee)).toEqual(["Dev", "Sam Rivera"]);
  });

  it("replaces an invented or blank owner with Unassigned", () => {
    const out = cleanExtraction(
      extraction({ action_items: [action({ assignee: "Priya" }), action({ assignee: "" }), action({ assignee: "unassigned" })] }),
      NOTES,
    );
    expect(out.action_items.map((a) => a.assignee)).toEqual(["Unassigned", "Unassigned", "Unassigned"]);
  });

  it("drops due dates that aren't real dates", () => {
    const out = cleanExtraction(
      extraction({ action_items: [action({ due_date: "2026-02-31" }), action({ due_date: "Friday" }), action({ due_date: null })] }),
      NOTES,
    );
    expect(out.action_items.map((a) => a.due_date)).toEqual([null, null, null]);
  });

  it("drops rows with blank titles in every category", () => {
    const out = cleanExtraction(
      extraction({
        action_items: [action({ title: "   " })],
        decisions: [{ title: "", details: "d", source_quote: "q", source_page: null }],
        risks: [{ title: " ", details: "d", severity: "low", source_quote: "q", source_page: null }],
        questions: [{ question: "", source_quote: "", source_page: null }],
      }),
      NOTES,
    );
    expect(isEmptyExtraction(out)).toBe(true);
  });
});

describe("isEmptyExtraction", () => {
  it("is false as soon as any category has a row", () => {
    expect(isEmptyExtraction(extraction())).toBe(true);
    expect(isEmptyExtraction(extraction({ questions: [{ question: "Generator required?", source_quote: "", source_page: null }] }))).toBe(false);
  });
});

describe("clampPlan", () => {
  const task = (overrides: Partial<PlanOutput["sections"][number]["tasks"][number]> = {}) => ({
    title: "Task",
    details: "Done when done.",
    priority: "medium" as const,
    start_offset: 0,
    duration_days: 5,
    ...overrides,
  });

  it("clamps schedule numbers into the allowed range", () => {
    const out = clampPlan({
      sections: [{ name: "Design", tasks: [task({ start_offset: -10, duration_days: 0 }), task({ start_offset: 5000, duration_days: 9999 })] }],
    });
    expect(out.sections[0].tasks.map((t) => [t.start_offset, t.duration_days])).toEqual([
      [0, 1],
      [730, 365],
    ]);
  });

  it("rounds fractional days", () => {
    const out = clampPlan({ sections: [{ name: "Design", tasks: [task({ start_offset: 2.6, duration_days: 3.4 })] }] });
    expect(out.sections[0].tasks[0]).toMatchObject({ start_offset: 3, duration_days: 3 });
  });

  it("drops blank sections and tasks, and trims names", () => {
    const out = clampPlan({
      sections: [
        { name: "  Design  ", tasks: [task({ title: "  Size header " }), task({ title: " " })] },
        { name: "  ", tasks: [task()] },
      ],
    });
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].name).toBe("Design");
    expect(out.sections[0].tasks.map((t) => t.title)).toEqual(["Size header"]);
  });

  it("caps the number of sections, tasks and text lengths", () => {
    const out = clampPlan({
      sections: Array.from({ length: 20 }, (_, i) => ({
        name: `S${i}`.padEnd(300, "x"),
        tasks: Array.from({ length: 60 }, () => task({ title: "t".repeat(900), details: "d".repeat(9000) })),
      })),
    });
    expect(out.sections).toHaveLength(12);
    expect(out.sections[0].name).toHaveLength(120);
    expect(out.sections[0].tasks).toHaveLength(40);
    expect(out.sections[0].tasks[0].title).toHaveLength(500);
    expect(out.sections[0].tasks[0].details).toHaveLength(5000);
  });
});
