import { describe, expect, it } from "vitest";
import { findConflicts, isConflict, newConflictsFrom, wouldCycle } from "@/lib/dependencies";
import { DEFAULT_FILTERS, applyFilters, filtersToQuery, isFiltering, parseFilters, sortTasks } from "@/lib/filters";
import { tablePdf, wrap } from "@/lib/pdf";
import { planFromProject } from "@/lib/project-template";
import { canResubmit, daysOpen, rfiLogRow, rfiNumber, rfiOverdue, submittalLogRow, submittalNumber, submittalOverdue, type Rfi, type Submittal } from "@/lib/registers";
import { TEMPLATES } from "@/lib/templates";
import type { Task } from "@/lib/types";
import { loadLevel, workloadGrid, type WorkloadRow } from "@/lib/workload";
import { PlanSchema } from "@/server/schemas";

let n = 0;
function task(patch: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: `t${n}`,
    project_id: "p",
    workspace_id: "w",
    created_by: null,
    source_document_id: null,
    source_quote: null,
    source_page: null,
    section_id: null,
    type: "action_item",
    title: `Task ${n}`,
    details: null,
    assignee: null,
    assignee_id: null,
    start_date: null,
    due_date: null,
    priority: null,
    status: "open",
    position: n,
    completed_at: null,
    created_at: `2026-11-0${(n % 9) + 1}T00:00:00Z`,
    subtask_total: 0,
    subtask_done: 0,
    comment_count: 0,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// Filters and saved views
// ---------------------------------------------------------------------------

describe("filters in the URL", () => {
  it("round-trips through a query string", () => {
    const f = { ...DEFAULT_FILTERS, search: "pump", owner: "Dana", status: ["stuck" as const, "open" as const], priority: ["high" as const, "none" as const], due: "week" as const, hideDone: true, sort: "due" as const, desc: true };
    const query = filtersToQuery(f);
    expect(query).toBe("q=pump&owner=Dana&status=open%2Cstuck&priority=high%2Cnone&due=week&done=hide&sort=due&dir=desc");
    expect(parseFilters(new URLSearchParams(query))).toEqual({ ...f, status: ["open", "stuck"] });
  });

  it("leaves defaults out and ignores junk", () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
    const parsed = parseFilters({ status: "open,bogus", sort: "nope", due: "someday", dir: "desc" });
    expect(parsed.status).toEqual(["open"]);
    expect(parsed.sort).toBe("manual");
    expect(parsed.due).toBe("");
    // A direction without a sort isn't kept.
    expect(filtersToQuery(parsed)).toBe("status=open");
  });

  it("sorting alone doesn't count as filtering", () => {
    expect(isFiltering({ ...DEFAULT_FILTERS, sort: "due" })).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTERS, status: ["open"] })).toBe(true);
  });

  it("applies every filter", () => {
    const today = "2026-11-25"; // a Wednesday; week is Nov 23-29
    const tasks = [
      task({ title: "Pump curve", assignee: "Dana", status: "open", priority: "high", due_date: "2026-11-24", section_id: "s1" }),
      task({ title: "Valve list", assignee: "Lee", status: "stuck", priority: null, due_date: "2026-12-01", section_id: "s2" }),
      task({ title: "Old item", assignee: null, status: "done", due_date: "2026-11-10" }),
      task({ title: "Late item", assignee: "dana", status: "in_progress", due_date: "2026-11-20" }),
    ];
    const titles = (f: Partial<typeof DEFAULT_FILTERS>) => applyFilters(tasks, { ...DEFAULT_FILTERS, ...f }, today).map((t) => t.title);
    expect(titles({ owner: "Dana" })).toEqual(["Pump curve", "Late item"]);
    expect(titles({ owner: "__none" })).toEqual(["Old item"]);
    expect(titles({ status: ["stuck", "done"] })).toEqual(["Valve list", "Old item"]);
    expect(titles({ priority: ["none"] })).toEqual(["Valve list", "Old item", "Late item"]);
    expect(titles({ section: "s2" })).toEqual(["Valve list"]);
    expect(titles({ due: "overdue" })).toEqual(["Pump curve", "Late item"]);
    expect(titles({ due: "week" })).toEqual(["Pump curve"]);
    expect(titles({ due: "next_week" })).toEqual(["Valve list"]);
    expect(titles({ hideDone: true, search: "item" })).toEqual(["Late item"]);
  });

  it("sorts with empty values last, either direction", () => {
    const a = task({ title: "b", due_date: "2026-12-02" });
    const b = task({ title: "a", due_date: null });
    const c = task({ title: "c", due_date: "2026-11-30" });
    expect(sortTasks([a, b, c], "due").map((t) => t.due_date)).toEqual(["2026-11-30", "2026-12-02", null]);
    expect(sortTasks([a, b, c], "due", true).map((t) => t.due_date)).toEqual(["2026-12-02", "2026-11-30", null]);
    expect(sortTasks([a, b, c], "title").map((t) => t.title)).toEqual(["a", "b", "c"]);
    expect(sortTasks([c, a, b], "manual").map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });
});

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

describe("dependencies", () => {
  const pred = task({ due_date: "2026-12-05" });
  const succ = task({ start_date: "2026-12-08", due_date: "2026-12-10" });
  const deps = [{ id: "d1", predecessor_id: pred.id, successor_id: succ.id }];

  it("flags a successor that starts on or before the predecessor is due", () => {
    expect(isConflict(pred, succ)).toBe(false);
    expect(isConflict(pred, { ...succ, start_date: "2026-12-05" })).toBe(true);
    expect(isConflict(pred, { ...succ, start_date: null, due_date: "2026-12-04" })).toBe(true);
    // Done work never conflicts, and undated work can't.
    expect(isConflict({ ...pred, status: "done" }, { ...succ, start_date: "2026-12-01" })).toBe(false);
    expect(isConflict({ ...pred, due_date: null }, succ)).toBe(false);
  });

  it("changing a predecessor's date flags its successors", () => {
    expect(findConflicts([pred, succ], deps)).toHaveLength(0);
    const flagged = newConflictsFrom(pred.id, { due_date: "2026-12-09" }, [pred, succ], deps);
    expect(flagged.map((t) => t.id)).toEqual([succ.id]);
    expect(findConflicts([{ ...pred, due_date: "2026-12-09" }, succ], deps)[0].successor.id).toBe(succ.id);
  });

  it("detects loops before they're saved", () => {
    const d = [
      { id: "1", predecessor_id: "a", successor_id: "b" },
      { id: "2", predecessor_id: "b", successor_id: "c" },
    ];
    expect(wouldCycle("c", "a", d)).toBe(true);
    expect(wouldCycle("a", "c", d)).toBe(false);
    expect(wouldCycle("a", "a", d)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

const rfi = (patch: Partial<Rfi> = {}): Rfi => ({
  id: "r",
  workspace_id: "w",
  project_id: "p",
  number: 7,
  subject: "Beam bearing",
  question: "What elevation?",
  response: null,
  status: "open",
  asked_by_id: null,
  ball_in_court: "Structural",
  ball_in_court_id: null,
  date_required: "2026-11-20",
  opened_at: "2026-11-10T15:00:00Z",
  answered_at: null,
  closed_at: null,
  source_item_id: null,
  created_by: null,
  created_at: "2026-11-10T15:00:00Z",
  updated_at: "2026-11-10T15:00:00Z",
  ...patch,
});

describe("registers", () => {
  it("numbers RFIs and submittals", () => {
    expect(rfiNumber(7)).toBe("RFI-007");
    expect(rfiNumber(1234)).toBe("RFI-1234");
    expect(submittalNumber(12)).toBe("S-012");
    expect(submittalNumber(12, 2)).toBe("S-012 Rev 2");
  });

  it("counts days open until answered", () => {
    expect(daysOpen(rfi(), "2026-11-25")).toBe(15);
    expect(daysOpen(rfi({ opened_at: "2026-11-25T08:00:00Z" }), "2026-11-25")).toBe(0);
    expect(daysOpen(rfi({ status: "answered", answered_at: "2026-11-13T09:00:00Z" }), "2026-11-25")).toBe(3);
    expect(daysOpen(rfi({ status: "draft", opened_at: null }), "2026-11-25")).toBeNull();
  });

  it("knows when an RFI or submittal is late", () => {
    expect(rfiOverdue(rfi(), "2026-11-21")).toBe(true);
    expect(rfiOverdue(rfi({ status: "answered" }), "2026-11-21")).toBe(false);
    expect(rfiOverdue(rfi(), null)).toBe(false);
    const s = { action: "pending", due_on: "2026-11-20" } as Submittal;
    expect(submittalOverdue(s, "2026-11-21")).toBe(true);
    expect(submittalOverdue({ ...s, action: "approved" }, "2026-11-21")).toBe(false);
    expect(canResubmit({ action: "revise_resubmit" })).toBe(true);
    expect(canResubmit({ action: "approved_as_noted" })).toBe(false);
  });

  it("builds log rows", () => {
    expect(rfiLogRow(rfi(), "Sam", "2026-11-25")).toEqual([
      "RFI-007",
      "Beam bearing",
      "Open",
      "Structural",
      "Sam",
      "2026-11-10",
      "2026-11-20",
      "",
      "15",
      "What elevation?",
      "",
    ]);
    const s = { number: 3, revision: 1, spec_section: "23 34 00", title: "Fans", submitted_by: "ACME", reviewer: "Lee", received_on: "2026-11-01", due_on: "2026-11-15", returned_on: null, action: "approved_as_noted", review_notes: "See markups" } as Submittal;
    expect(submittalLogRow(s)).toEqual(["S-003", "1", "23 34 00", "Fans", "ACME", "Lee", "2026-11-01", "2026-11-15", "", "Approved as noted", "See markups"]);
  });
});

// ---------------------------------------------------------------------------
// PDF log export
// ---------------------------------------------------------------------------

describe("pdf", () => {
  it("wraps long text and caps the line count", () => {
    const lines = wrap("one two three four five six seven eight nine ten", 40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    const capped = wrap("word ".repeat(200), 40, 3);
    expect(capped).toHaveLength(3);
    expect(capped[2].endsWith("...")).toBe(true);
  });

  it("writes a valid multi-page PDF with escaped text", () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`RFI-${i}`, `Subject (${i}) \\ “quoted” – ✓`]);
    const bytes = tablePdf({ title: "Log", columns: [{ header: "No.", width: 1 }, { header: "Subject", width: 4 }], rows });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const pages = Number(/\/Count (\d+)/.exec(text)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`Page 1 of ${pages}`);
    expect(text).toContain("Subject \\(5\\) \\\\ \"quoted\" - ?");
    // The xref offsets point at each object.
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const first = /xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(text)?.[1];
    expect(text.slice(Number(first), Number(first) + 7)).toBe("1 0 obj");
  });
});

// ---------------------------------------------------------------------------
// Workload grid
// ---------------------------------------------------------------------------

describe("workload grid", () => {
  const rows: WorkloadRow[] = [
    { person_key: "id:u1", person_id: "u1", person_name: "Zed", bucket: "overdue", week_start: null, open_count: 2, overdue_count: 2 },
    { person_key: "id:u1", person_id: "u1", person_name: "Zed", bucket: "week", week_start: "2026-11-23", open_count: 3, overdue_count: 1 },
    { person_key: "name:sub co", person_id: null, person_name: "Sub Co", bucket: "week", week_start: "2026-11-30", open_count: 1, overdue_count: 0 },
    { person_key: "none", person_id: null, person_name: null, bucket: "none", week_start: null, open_count: 4, overdue_count: 0 },
    { person_key: "id:u2", person_id: "u2", person_name: "Amy", bucket: "week", week_start: "2026-12-28", open_count: 9, overdue_count: 0 }, // beyond the window
  ];

  it("places counts by person and week", () => {
    const grid = workloadGrid(rows, "2026-11-25", 3);
    expect(grid.weeks).toEqual(["2026-11-23", "2026-11-30", "2026-12-07"]);
    expect(grid.people.map((p) => p.name)).toEqual(["Amy", "Zed", "Sub Co", "Unassigned"]);
    const zed = grid.people.find((p) => p.name === "Zed")!;
    expect(zed.overdue).toEqual({ open: 2, overdue: 2 });
    expect(zed.weeks[0]).toEqual({ open: 3, overdue: 1 });
    expect(zed.total).toBe(5);
    expect(grid.people.find((p) => p.name === "Sub Co")!.weeks[1].open).toBe(1);
    expect(grid.people.find((p) => p.name === "Unassigned")!.noDate.open).toBe(4);
    expect(grid.people.find((p) => p.name === "Amy")!.total).toBe(0);
  });

  it("shades by load", () => {
    expect([0, 2, 5, 9].map(loadLevel)).toEqual(["none", "light", "medium", "heavy"]);
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe("templates", () => {
  it("every built-in template is a valid plan, including the Phase 5 ones", () => {
    for (const t of TEMPLATES) expect(PlanSchema.safeParse(t.plan).success, t.id).toBe(true);
    expect(TEMPLATES.map((t) => t.id)).toEqual(expect.arrayContaining(["mep-design", "structural-design", "site-civil", "npi"]));
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it("saves a project as a plan with date offsets", () => {
    const plan = planFromProject(
      [
        { id: "s1", name: "Design" },
        { id: "s2", name: "Build" },
      ],
      [
        { title: "Calcs", details: null, priority: "high", start_date: "2026-12-01", due_date: "2026-12-05", section_id: "s1" },
        { title: "Drawings", details: "IFC set", priority: null, start_date: null, due_date: "2026-12-10", section_id: "s1" },
        { title: "Pour", details: null, priority: null, start_date: null, due_date: null, section_id: "s2" },
        { title: "Loose", details: null, priority: null, start_date: null, due_date: null, section_id: null },
      ],
    );
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.sections.map((s) => s.name)).toEqual(["Design", "Build", "Other tasks"]);
    expect(plan.sections[0].tasks[0]).toMatchObject({ title: "Calcs", start_offset: 0, duration_days: 5 });
    expect(plan.sections[0].tasks[1]).toMatchObject({ start_offset: 9, duration_days: 1 });
    expect(plan.sections[1].tasks[0]).toMatchObject({ start_offset: null, duration_days: null });
  });
});
