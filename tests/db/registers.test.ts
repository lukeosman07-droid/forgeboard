import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Phase 5: registers, reviews, dependencies, saved views, templates and the
// workload, enforced by the database. Runs against a LOCAL Supabase with every
// migration applied.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error(`Database tests only run against a local Supabase, but NEXT_PUBLIC_SUPABASE_URL is "${url || "(not set)"}".`);
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const PASSWORD = "test-password-1234";
const stamp = Date.now();

type TestUser = { id: string; email: string; client: SupabaseClient };
const users: TestUser[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `reg-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: label } });
  if (error || !data.user) throw new Error(`Couldn't create ${label}: ${error?.message}`);
  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Couldn't sign in ${label}: ${signInError.message}`);
  const user = { id: data.user.id, email, client };
  users.push(user);
  return user;
}

let owner: TestUser;
let member: TestUser;
let guest: TestUser;
let ws: string;
let project: string;
let other: string;

async function item(title: string, patch: Record<string, unknown> = {}, p = project) {
  const { data, error } = await owner.client
    .from("items")
    .insert({ project_id: p, type: "action_item", title, status: "open", position: Math.random(), ...patch })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data!.id;
}

beforeAll(async () => {
  [owner, member, guest] = await Promise.all([createUser("owner"), createUser("member"), createUser("guest")]);
  const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", owner.id).eq("role", "owner").single();
  ws = data!.workspace_id as string;
  const added = await admin.from("workspace_members").insert([
    { workspace_id: ws, user_id: member.id, role: "member" },
    { workspace_id: ws, user_id: guest.id, role: "guest" },
  ]);
  if (added.error) throw new Error(added.error.message);
  const p = await owner.client.from("projects").insert({ workspace_id: ws, name: "Pump station" }).select("id").single<{ id: string }>();
  const p2 = await owner.client.from("projects").insert({ workspace_id: ws, name: "Office fit-out" }).select("id").single<{ id: string }>();
  project = p.data!.id;
  other = p2.data!.id;
  await admin.from("project_members").insert({ project_id: project, user_id: guest.id });
});

afterAll(async () => {
  for (const user of users) {
    const owned = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner");
    for (const row of owned.data ?? []) await admin.from("workspaces").delete().eq("id", row.workspace_id);
    await admin.auth.admin.deleteUser(user.id);
  }
});

describe("RFIs", () => {
  it("numbers per project and stamps the status dates", async () => {
    const a = await owner.client.from("rfis").insert({ project_id: project, subject: "Pump base anchor bolts" }).select("*").single();
    const b = await member.client.from("rfis").insert({ project_id: project, subject: "Wet well coating", ball_in_court_id: owner.id }).select("*").single();
    const c = await owner.client.from("rfis").insert({ project_id: other, subject: "Ceiling grid" }).select("*").single();
    expect(a.error).toBeNull();
    expect([a.data.number, b.data.number, c.data.number]).toEqual([1, 2, 1]);
    expect(a.data.opened_at).not.toBeNull();
    expect(b.data.ball_in_court).toBe("owner");
    expect(a.data.asked_by_id).toBe(owner.id);

    // The number can't be changed, and answering stamps answered_at.
    const answered = await owner.client.from("rfis").update({ status: "answered", response: "Use 3/4 in." }).eq("id", a.data.id).select("*").single();
    expect(answered.data.answered_at).not.toBeNull();
    const renumber = await owner.client.from("rfis").update({ number: 99 } as never).eq("id", a.data.id).select("number");
    expect(renumber.error).not.toBeNull();
    // Reopening clears the answer date.
    const reopened = await owner.client.from("rfis").update({ status: "open" }).eq("id", a.data.id).select("*").single();
    expect(reopened.data.answered_at).toBeNull();
  });

  it("lets a guest read but not write, and checks ball in court is a member", async () => {
    const read = await guest.client.from("rfis").select("id").eq("project_id", project);
    expect(read.data!.length).toBeGreaterThan(0);
    const write = await guest.client.from("rfis").insert({ project_id: project, subject: "Guest RFI" });
    expect(write.error?.code).toBe("42501");
    const outsider = await owner.client.from("rfis").insert({ project_id: project, subject: "x", ball_in_court_id: "00000000-0000-0000-0000-000000000001" });
    expect(outsider.error?.message).toContain("member");
  });

  it("is searchable, with the RFI number in the title", async () => {
    const { data } = await owner.client.rpc("search_workspace", { ws, q: "anchor bolts", p_limit: 10 });
    const hit = (data as { kind: string; title: string }[]).find((m) => m.kind === "rfi");
    expect(hit?.title).toBe("RFI-001: Pump base anchor bolts");
  });
});

describe("submittals", () => {
  it("keeps each revision's decision in the history", async () => {
    const s = await owner.client.from("submittals").insert({ project_id: project, title: "Pump data", spec_section: "43 21 00" }).select("*").single();
    expect(s.data.number).toBe(1);
    expect(s.data.action).toBe("pending");

    const early = await owner.client.from("submittals").update({ revision: 1 }).eq("id", s.data.id).select("id");
    expect(early.error?.message).toContain("submittal_resubmit_not_needed");

    const sent = await owner.client.from("submittals").update({ action: "revise_resubmit", review_notes: "Wrong impeller" }).eq("id", s.data.id).select("*").single();
    expect(sent.data.returned_on).not.toBeNull();
    const skip = await owner.client.from("submittals").update({ revision: 3 }).eq("id", s.data.id).select("id");
    expect(skip.error?.message).toContain("submittal_revision_order");

    const next = await owner.client.from("submittals").update({ revision: 1 }).eq("id", s.data.id).select("*").single();
    expect(next.data).toMatchObject({ revision: 1, action: "pending", returned_on: null, review_notes: null });
    const history = await guest.client.from("submittal_revisions").select("revision, action, review_notes").eq("submittal_id", s.data.id);
    expect(history.data).toEqual([{ revision: 0, action: "revise_resubmit", review_notes: "Wrong impeller" }]);
  });
});

describe("plan gating", () => {
  it("a plan without registers can't add RFIs, but milestones and views still work", async () => {
    await admin.from("workspaces").update({ plan: "starter", subscription_status: "active" }).eq("id", ws);
    try {
      const rfi = await owner.client.from("rfis").insert({ project_id: project, subject: "Blocked" });
      expect(rfi.error?.code).toBe("42501");
      const milestone = await owner.client.from("milestones").insert({ project_id: project, name: "IFC", due_on: "2027-01-15" }).select("id").single();
      expect(milestone.error).toBeNull();
      const view = await owner.client.from("saved_views").insert({ project_id: project, name: "Mine", view: "table", query: "status=open", shared: false });
      expect(view.error).toBeNull();
      const template = await owner.client.from("templates").insert({ workspace_id: ws, name: "T", plan: { sections: [] } });
      expect(template.error?.code).toBe("42501");
    } finally {
      await admin.from("workspaces").update({ plan: "trial", subscription_status: null }).eq("id", ws);
    }
  });
});

describe("design reviews", () => {
  it("only closes once every comment has a disposition and incorporations are done", async () => {
    const review = await owner.client.from("reviews").insert({ project_id: project, name: "60% review" }).select("id").single();
    const comment = await item("Add a second pump", { review_id: review.data!.id });
    const { data: row } = await owner.client.from("items").select("disposition").eq("id", comment).single();
    expect(row!.disposition).toBe("pending");

    const early = await owner.client.from("reviews").update({ status: "closed" }).eq("id", review.data!.id).select("id");
    expect(early.error?.message).toContain("review_not_ready");

    await owner.client.from("items").update({ disposition: "incorporate" }).eq("id", comment);
    const stillOpen = await owner.client.from("reviews").update({ status: "closed" }).eq("id", review.data!.id).select("id");
    expect(stillOpen.error?.message).toContain("review_not_ready");

    await owner.client.from("items").update({ status: "done" }).eq("id", comment);
    const closed = await owner.client.from("reviews").update({ status: "closed" }).eq("id", review.data!.id).select("closed_at, closed_by").single();
    expect(closed.error).toBeNull();
    expect(closed.data!.closed_by).toBe(owner.id);

    const late = await owner.client.from("items").insert({ project_id: project, type: "action_item", title: "Late comment", status: "open", position: 1, review_id: review.data!.id });
    expect(late.error?.message).toContain("review_closed");
  });
});

describe("dependencies", () => {
  it("refuses loops and flags successors when a predecessor moves", async () => {
    const design = await item("Design", { start_date: "2026-12-01", due_date: "2026-12-10" });
    const build = await item("Build", { start_date: "2026-12-11", due_date: "2026-12-20" });
    const test = await item("Test", { start_date: "2026-12-21", due_date: "2026-12-22" });
    const elsewhere = await item("Elsewhere", {}, other);

    expect((await owner.client.from("item_dependencies").insert({ predecessor_id: design, successor_id: build })).error).toBeNull();
    expect((await owner.client.from("item_dependencies").insert({ predecessor_id: build, successor_id: test })).error).toBeNull();
    const loop = await owner.client.from("item_dependencies").insert({ predecessor_id: test, successor_id: design });
    expect(loop.error?.message).toContain("dependency_cycle");
    const cross = await owner.client.from("item_dependencies").insert({ predecessor_id: design, successor_id: elsewhere });
    expect(cross.error).not.toBeNull();
    const guestLink = await guest.client.from("item_dependencies").insert({ predecessor_id: design, successor_id: test });
    expect(guestLink.error?.code).toBe("42501");

    const before = await owner.client.rpc("dependency_conflicts", { p_project: project });
    expect(before.data).toEqual([]);
    await owner.client.from("items").update({ due_date: "2026-12-12" }).eq("id", design);
    const after = await owner.client.rpc("dependency_conflicts", { p_project: project });
    expect((after.data as { successor_id: string }[]).map((c) => c.successor_id)).toEqual([build]);
  });
});

describe("saved views", () => {
  it("keeps private views private and shares the rest", async () => {
    const mine = await member.client.from("saved_views").insert({ project_id: project, name: "My stuck", view: "board", query: "status=stuck", shared: false }).select("id").single();
    const team = await member.client.from("saved_views").insert({ project_id: project, name: "Overdue", view: "table", query: "due=overdue&sort=due", shared: true }).select("id").single();
    expect(mine.error).toBeNull();
    expect(team.error).toBeNull();
    const seenByOwner = await owner.client.from("saved_views").select("name").eq("project_id", project);
    expect(seenByOwner.data!.map((v) => v.name)).toContain("Overdue");
    expect(seenByOwner.data!.map((v) => v.name)).not.toContain("My stuck");
    // A guest can keep a private view but can't share one.
    expect((await guest.client.from("saved_views").insert({ project_id: project, name: "G", view: "table", query: "", shared: false })).error).toBeNull();
    expect((await guest.client.from("saved_views").insert({ project_id: project, name: "G2", view: "table", query: "", shared: true })).error?.code).toBe("42501");
  });
});

describe("templates", () => {
  it("members save templates; guests can't see them", async () => {
    const saved = await member.client.from("templates").insert({ workspace_id: ws, name: "Lift station", plan: { sections: [{ name: "Design", tasks: [] }] } }).select("id").single();
    expect(saved.error).toBeNull();
    const bad = await member.client.from("templates").insert({ workspace_id: ws, name: "Bad", plan: { nope: true } });
    expect(bad.error).not.toBeNull();
    expect((await guest.client.from("templates").select("id")).data).toEqual([]);
    expect((await owner.client.from("templates").select("id")).data!.length).toBe(1);
  });
});

describe("workload", () => {
  it("matches a manual count of open tasks", async () => {
    const today = "2026-12-02"; // Wednesday; this week starts Monday Nov 30
    const p = await owner.client.from("projects").insert({ workspace_id: ws, name: "Workload check" }).select("id").single<{ id: string }>();
    const pid = p.data!.id;
    await item("Late", { assignee_id: member.id, assignee: "member", due_date: "2026-11-20" }, pid);
    await item("Due Tue (late)", { assignee_id: member.id, assignee: "member", due_date: "2026-12-01" }, pid);
    await item("Due Fri", { assignee_id: member.id, assignee: "member", due_date: "2026-12-04" }, pid);
    await item("Next week", { assignee: "Sub Co", due_date: "2026-12-08" }, pid);
    await item("No date", {}, pid);
    await item("Done", { assignee_id: member.id, assignee: "member", due_date: "2026-12-03", status: "done" }, pid);
    await item("Far out", { assignee_id: member.id, assignee: "member", due_date: "2027-03-01" }, pid);

    const { data, error } = await owner.client.rpc("workload", { ws, p_today: today, p_weeks: 2 });
    expect(error).toBeNull();
    type Row = { person_key: string; bucket: string; week_start: string | null; open_count: number; overdue_count: number };
    const rows = data as Row[];
    // Manual count across the whole workspace, from the items table.
    const { data: open } = await admin.from("items").select("assignee_id, assignee, due_date").eq("workspace_id", ws).eq("type", "action_item").neq("status", "done");
    const inWindow = (open ?? []).filter((t) => !t.due_date || t.due_date <= "2026-12-13");
    expect(rows.reduce((n, r) => n + r.open_count, 0)).toBe(inWindow.length);

    const memberRows = rows.filter((r) => r.person_key === `id:${member.id}`);
    const cell = (bucket: string, week?: string) => memberRows.find((r) => r.bucket === bucket && (week ? r.week_start === week : true));
    expect(cell("overdue")?.open_count).toBe(1);
    expect(cell("week", "2026-11-30")).toMatchObject({ open_count: 2, overdue_count: 1 });
    expect(rows.find((r) => r.person_key === "name:sub co")).toMatchObject({ bucket: "week", week_start: "2026-12-07", open_count: 1 });

    // Not on the plan: nothing.
    await admin.from("workspaces").update({ plan: "team", subscription_status: "active" }).eq("id", ws);
    try {
      expect((await owner.client.rpc("workload", { ws, p_today: today, p_weeks: 2 })).data).toEqual([]);
    } finally {
      await admin.from("workspaces").update({ plan: "trial", subscription_status: null }).eq("id", ws);
    }
  });
});
