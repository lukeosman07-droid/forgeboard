import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Database isolation tests. They run against a LOCAL Supabase (`npx supabase start`)
// with every migration applied, and prove that one account can't read or change
// another account's rows through the public API.
//
// Each table is checked both ways:
//   * the owner CAN select, insert, update and delete their rows, and
//   * a second user and a signed-out visitor CAN'T.
// So the suite fails if a policy is dropped (the owner loses access) and if Row
// Level Security is turned off (the other user gains access).
//
// Add a case here in the same pull request that creates a new table.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// These tests create and delete users. Never let them touch a hosted project.
const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error(
    `Database tests only run against a local Supabase, but NEXT_PUBLIC_SUPABASE_URL is "${url || "(not set)"}". ` +
      "Start one with `npx supabase start` and export the values from `npx supabase status -o env`.",
  );
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const visitor = createClient(url, anonKey, options); // never signs in

const PASSWORD = "test-password-1234";
const stamp = Date.now();

type TestUser = { id: string; email: string; client: SupabaseClient };

async function createUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `User ${label.toUpperCase()}`, company_name: `Company ${label.toUpperCase()}` },
  });
  if (error || !data.user) throw new Error(`Couldn't create test user ${label}: ${error?.message}`);

  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Couldn't sign in test user ${label}: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

/** Inserts one row as `client` and returns its id, or throws with the reason. */
async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error || !data) throw new Error(`Insert into ${table} failed: ${error?.message}`);
  return data.id as string;
}

// The tables that hold customer work, in parent-to-child order, with a harmless
// change to try on each. item_comments has no update permission at all.
const TABLES: { name: string; change: Record<string, unknown> | null }[] = [
  { name: "projects", change: { name: "Changed" } },
  { name: "sections", change: { name: "Changed" } },
  { name: "notes", change: { raw_text: "Changed" } },
  { name: "items", change: { title: "Changed" } },
  { name: "subtasks", change: { title: "Changed" } },
  { name: "item_comments", change: null },
];

let a: TestUser;
let b: TestUser;
/** Row ids that user A owns, by table. */
const rows: Record<string, string> = {};
/** A project that user B owns, used to try cross-account links. */
let bProject: string;

beforeAll(async () => {
  [a, b] = await Promise.all([createUser("a"), createUser("b")]);

  // The owner can insert into every table (this is the "owner can insert" check).
  rows.projects = await insert(a.client, "projects", { name: "A's project" });
  rows.sections = await insert(a.client, "sections", { project_id: rows.projects, name: "Design" });
  rows.notes = await insert(a.client, "notes", { project_id: rows.projects, raw_text: "A's private meeting notes" });
  rows.items = await insert(a.client, "items", {
    project_id: rows.projects,
    section_id: rows.sections,
    note_id: rows.notes,
    type: "action_item",
    title: "A's task",
  });
  rows.subtasks = await insert(a.client, "subtasks", { item_id: rows.items, title: "A's subtask" });
  rows.item_comments = await insert(a.client, "item_comments", { item_id: rows.items, body: "A's comment" });

  bProject = await insert(b.client, "projects", { name: "B's project" });
});

afterAll(async () => {
  // Deleting the users removes everything they own (on delete cascade).
  await Promise.all([a, b].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe.each(TABLES)("$name", ({ name, change }) => {
  it("the owner can read their row", async () => {
    const { data, error } = await a.client.from(name).select("id").eq("id", rows[name]);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("another user can't read it", async () => {
    const byId = await b.client.from(name).select("id").eq("id", rows[name]);
    expect(byId.data ?? []).toHaveLength(0);

    const everything = await b.client.from(name).select("id");
    expect((everything.data ?? []).map((r) => r.id)).not.toContain(rows[name]);
  });

  it("a signed-out visitor can't read it", async () => {
    const { data } = await visitor.from(name).select("id").eq("id", rows[name]);
    expect(data ?? []).toHaveLength(0);
  });

  it("another user can't change it", async () => {
    const attempt = change ?? { body: "Changed" };
    const { data } = await b.client.from(name).update(attempt).eq("id", rows[name]).select("id");
    expect(data ?? []).toHaveLength(0);

    const column = Object.keys(attempt)[0];
    const { data: row } = await admin.from(name).select(column).eq("id", rows[name]).single();
    expect((row as Record<string, unknown> | null)?.[column]).not.toBe("Changed");
  });

  it("another user and a visitor can't delete it", async () => {
    for (const client of [b.client, visitor]) {
      const { data } = await client.from(name).delete().eq("id", rows[name]).select("id");
      expect(data ?? []).toHaveLength(0);
    }
    const { data: stillThere } = await admin.from(name).select("id").eq("id", rows[name]);
    expect(stillThere).toHaveLength(1);
  });

  if (change) {
    it("the owner can change it", async () => {
      const column = Object.keys(change)[0];
      const { data, error } = await a.client.from(name).update({ [column]: "Owner edit" }).eq("id", rows[name]).select("id");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  }
});

describe("writing into another account", () => {
  it("can't add rows under someone else's project or task", async () => {
    const attempts: [string, Record<string, unknown>][] = [
      ["sections", { project_id: rows.projects, name: "Intruder" }],
      ["notes", { project_id: rows.projects, raw_text: "Intruder" }],
      ["items", { project_id: rows.projects, type: "action_item", title: "Intruder" }],
      ["subtasks", { item_id: rows.items, title: "Intruder" }],
      ["item_comments", { item_id: rows.items, body: "Intruder" }],
    ];
    for (const [table, row] of attempts) {
      const { data, error } = await b.client.from(table).insert(row).select("id");
      expect(error, `${table} insert should be refused`).not.toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("can't create rows that claim to belong to someone else", async () => {
    const { error } = await b.client.from("projects").insert({ name: "Forged", owner_id: a.id }).select("id");
    expect(error).not.toBeNull();
  });

  it("can't link its own task to another account's section or note", async () => {
    for (const link of [{ section_id: rows.sections }, { note_id: rows.notes }]) {
      const { error } = await b.client
        .from("items")
        .insert({ project_id: bProject, type: "action_item", title: "Linked", ...link })
        .select("id");
      expect(error).not.toBeNull();
    }
  });

  it("can't move its own task into another account's project", async () => {
    const mine = await insert(b.client, "items", { project_id: bProject, type: "action_item", title: "B's task" });
    const { data, error } = await b.client.from("items").update({ project_id: rows.projects }).eq("id", mine).select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("a signed-out visitor can't insert anything", async () => {
    const { error } = await visitor.from("projects").insert({ name: "Visitor", owner_id: a.id }).select("id");
    expect(error).not.toBeNull();
  });
});

describe("profiles", () => {
  it("a user can read their own profile but nobody else's", async () => {
    const own = await a.client.from("profiles").select("id, full_name").eq("id", a.id);
    expect(own.data).toHaveLength(1);

    const other = await b.client.from("profiles").select("id").eq("id", a.id);
    expect(other.data ?? []).toHaveLength(0);

    const signedOut = await visitor.from("profiles").select("id").eq("id", a.id);
    expect(signedOut.data ?? []).toHaveLength(0);
  });

  it("a user can edit their name and company", async () => {
    const { error } = await a.client.from("profiles").update({ full_name: "Renamed A" }).eq("id", a.id);
    expect(error).toBeNull();
    const { data } = await admin.from("profiles").select("full_name").eq("id", a.id).single();
    expect(data?.full_name).toBe("Renamed A");
  });

  it("a user can't give themselves a paid plan or reset their AI usage", async () => {
    for (const change of [
      { plan: "business" },
      { subscription_status: "active" },
      { ai_extractions_used: 0 },
      { stripe_customer_id: "cus_forged" },
    ]) {
      const { error } = await a.client.from("profiles").update(change).eq("id", a.id);
      expect(error, `updating ${Object.keys(change)[0]} should be refused`).not.toBeNull();
    }
    const { data } = await admin.from("profiles").select("plan, subscription_status, stripe_customer_id").eq("id", a.id).single();
    expect(data).toEqual({ plan: "free", subscription_status: null, stripe_customer_id: null });
  });

  it("a user can't edit someone else's profile", async () => {
    await b.client.from("profiles").update({ full_name: "Hijacked" }).eq("id", a.id);
    const { data } = await admin.from("profiles").select("full_name").eq("id", a.id).single();
    expect(data?.full_name).not.toBe("Hijacked");
  });
});

describe("AI usage", () => {
  it("users can't read or write the usage log", async () => {
    await admin.from("ai_extraction_events").insert({ user_id: a.id });

    const read = await a.client.from("ai_extraction_events").select("id");
    expect(read.data ?? []).toHaveLength(0);

    const write = await a.client.from("ai_extraction_events").insert({ user_id: a.id }).select("id");
    expect(write.error).not.toBeNull();
  });

  it("users can't call the usage functions themselves", async () => {
    const claim = await a.client.rpc("claim_ai_extraction", { p_user_id: a.id, p_free_limit: 9999, p_hourly_limit: 9999 });
    expect(claim.error).not.toBeNull();

    const finish = await a.client.rpc("finish_ai_extraction", { p_event_id: 1, p_status: "failed" });
    expect(finish.error).not.toBeNull();
  });
});

describe("owner clean-up", () => {
  // Children first, so each delete is checked on its own rather than by cascade.
  it.each([...TABLES].reverse())("the owner can delete their $name row", async ({ name }) => {
    const { data, error } = await a.client.from(name).delete().eq("id", rows[name]).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("delete_own_account", () => {
  it("a signed-out visitor can't call it", async () => {
    const { error } = await visitor.rpc("delete_own_account");
    expect(error).not.toBeNull();
  });

  it("removes the caller and everything they own, and nobody else", async () => {
    const c = await createUser("c");
    const project = await insert(c.client, "projects", { name: "C's project" });
    const item = await insert(c.client, "items", { project_id: project, type: "action_item", title: "C's task" });

    const { error } = await c.client.rpc("delete_own_account");
    expect(error).toBeNull();

    const { data: user } = await admin.auth.admin.getUserById(c.id);
    expect(user.user).toBeNull();
    for (const [table, id] of [["profiles", c.id], ["projects", project], ["items", item]] as const) {
      const { data } = await admin.from(table).select("id").eq("id", id);
      expect(data, `${table} row should be gone`).toHaveLength(0);
    }

    // The other accounts are untouched.
    const { data: others } = await admin.from("profiles").select("id").in("id", [a.id, b.id]);
    expect(others).toHaveLength(2);
  });

  it("refuses to delete the shared demo account", async () => {
    const email = "demo@demo.com";
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    const created = existing
      ? null
      : (await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })).data.user;
    // If a demo account already exists locally we don't know its password; skip rather than change it.
    if (!created) return;

    const demo = createClient(url, anonKey, options);
    await demo.auth.signInWithPassword({ email, password: PASSWORD });
    const { error } = await demo.rpc("delete_own_account");
    expect(error).not.toBeNull();

    const { data: user } = await admin.auth.admin.getUserById(created.id);
    expect(user.user?.id).toBe(created.id);
    await admin.auth.admin.deleteUser(created.id);
  });
});
