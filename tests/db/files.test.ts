import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Phase 4: files, the project inbox, weekly reports and Ask, enforced by the
// database. Runs against a LOCAL Supabase with every migration applied.
// Covers the phase's acceptance criteria:
//   * an upload past the storage quota is refused with a clear message,
//   * a forwarded email becomes a document in the project,
//   * Ask's search never returns items from a project the asker can't read.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error(`Database tests only run against a local Supabase, but NEXT_PUBLIC_SUPABASE_URL is "${url || "(not set)"}".`);
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const visitor = createClient(url, anonKey, options);
const PASSWORD = "test-password-1234";
const stamp = Date.now();
const GB = 1024 ** 3;
const MB = 1024 ** 2;

type TestUser = { id: string; email: string; client: SupabaseClient };
const users: TestUser[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `files-${label}-${stamp}@example.test`;
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
let outsider: TestUser;
let ws: string;
let project: string;
let privateProject: string;

function startUpload(user: TestUser, row: Record<string, unknown>) {
  return user.client
    .from("attachments")
    .insert({ project_id: project, name: "minutes.pdf", size_bytes: 1000, mime_type: "application/pdf", ...row })
    .select("id, storage_path, status, workspace_id")
    .single<{ id: string; storage_path: string; status: string; workspace_id: string }>();
}

async function used() {
  const { data } = await admin.from("workspaces").select("storage_bytes_used").eq("id", ws).single();
  return Number(data!.storage_bytes_used);
}

beforeAll(async () => {
  [owner, member, guest, outsider] = await Promise.all([createUser("owner"), createUser("member"), createUser("guest"), createUser("outsider")]);
  const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", owner.id).eq("role", "owner").single();
  ws = data!.workspace_id as string;
  const added = await admin.from("workspace_members").insert([
    { workspace_id: ws, user_id: member.id, role: "member" },
    { workspace_id: ws, user_id: guest.id, role: "guest" },
  ]);
  if (added.error) throw new Error(added.error.message);

  const p = await owner.client.from("projects").insert({ workspace_id: ws, name: "Bridge" }).select("id").single<{ id: string }>();
  const p2 = await owner.client.from("projects").insert({ workspace_id: ws, name: "Private tower" }).select("id").single<{ id: string }>();
  project = p.data!.id;
  privateProject = p2.data!.id;
  await admin.from("project_members").insert({ project_id: project, user_id: guest.id });
});

afterAll(async () => {
  for (const user of users) {
    const owned = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner");
    for (const row of owned.data ?? []) {
      const files = await admin.from("attachments").select("storage_path").eq("workspace_id", row.workspace_id);
      const paths = (files.data ?? []).map((f) => f.storage_path as string);
      if (paths.length) await admin.storage.from("attachments").remove(paths);
      await admin.from("workspaces").delete().eq("id", row.workspace_id);
    }
    await admin.auth.admin.deleteUser(user.id);
  }
});

describe("attachments", () => {
  it("a member can start an upload; the path is chosen by the database", async () => {
    const { data, error } = await startUpload(member, { storage_path: "evil/path.pdf", workspace_id: crypto.randomUUID() });
    expect(error).toBeNull();
    expect(data!.status).toBe("pending");
    expect(data!.workspace_id).toBe(ws);
    expect(data!.storage_path.startsWith(`${ws}/${project}/`)).toBe(true);
    expect(data!.storage_path.endsWith("minutes.pdf")).toBe(true);
  });

  it("uploads to the storage path only with a pending row, then counts toward the quota", async () => {
    const before = await used();
    const body = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
    const row = (await startUpload(member, { size_bytes: body.size })).data!;
    expect(await used()).toBe(before + body.size);

    const up = await member.client.storage.from("attachments").upload(row.storage_path, body, { contentType: "application/pdf" });
    expect(up.error).toBeNull();
    // A path nobody started an upload for is refused.
    const stray = await member.client.storage.from("attachments").upload(`${ws}/${project}/${crypto.randomUUID()}-x.pdf`, body, { contentType: "application/pdf" });
    expect(stray.error).not.toBeNull();
    // Outsiders can't read the file; members can.
    expect((await outsider.client.storage.from("attachments").download(row.storage_path)).error).not.toBeNull();
    expect((await owner.client.storage.from("attachments").download(row.storage_path)).error).toBeNull();

    await member.client.from("attachments").delete().eq("id", row.id);
    expect(await used()).toBe(before);
  });

  it("refuses an upload past the plan's storage with a clear message", async () => {
    await admin.from("workspaces").update({ storage_bytes_used: GB - 5 * MB }).eq("id", ws);
    const { error } = await startUpload(member, { size_bytes: 10 * MB });
    expect(error?.message).toBe("storage_quota_exceeded");
    expect(error?.hint).toMatch(/over your plan's 1 GB of storage \(1019 MB used\)\. Delete some files or upgrade\./);
    const fits = await startUpload(member, { size_bytes: 1 * MB });
    expect(fits.error).toBeNull();
    await admin.from("attachments").delete().eq("id", fits.data!.id);
    await admin.from("workspaces").update({ storage_bytes_used: 0 }).eq("id", ws);
  });

  it("refuses files over 25 MB and types that could run in a browser", async () => {
    expect((await startUpload(member, { size_bytes: 26214401 })).error).not.toBeNull();
    for (const mime_type of ["text/html", "image/svg+xml", "application/javascript"]) {
      expect((await startUpload(member, { name: "x", mime_type })).error, mime_type).not.toBeNull();
    }
  });

  it("guests, outsiders and visitors can't upload; a guest sees files on shared projects only", async () => {
    const row = (await startUpload(member, {})).data!;
    expect((await startUpload(guest, {})).error).not.toBeNull();
    expect((await startUpload(outsider, {})).error).not.toBeNull();
    expect((await visitor.from("attachments").insert({ project_id: project, name: "a.pdf", size_bytes: 1, mime_type: "application/pdf" })).error).not.toBeNull();
    expect((await guest.client.from("attachments").select("id").eq("id", row.id)).data).toHaveLength(1);
    expect((await outsider.client.from("attachments").select("id").eq("id", row.id)).data).toHaveLength(0);
  });

  it("only the name, status and place of a file can change", async () => {
    const row = (await startUpload(member, {})).data!;
    expect((await member.client.from("attachments").update({ status: "ready", name: "renamed.pdf" }).eq("id", row.id)).error).toBeNull();
    expect((await member.client.from("attachments").update({ size_bytes: 1 }).eq("id", row.id)).error).not.toBeNull();
    expect((await member.client.from("attachments").update({ storage_path: "x" }).eq("id", row.id)).error).not.toBeNull();
  });

  it("can't attach to a task in another project", async () => {
    const t = await owner.client.from("items").insert({ project_id: privateProject, type: "action_item", title: "Other" }).select("id").single<{ id: string }>();
    expect((await startUpload(member, { item_id: t.data!.id })).error).not.toBeNull();
  });
});

describe("project inbox", () => {
  let token: string;

  it("a member turns it on; guests and outsiders can't see the address", async () => {
    const { data, error } = await member.client.from("project_inboxes").insert({ project_id: project }).select("token").single<{ token: string }>();
    expect(error).toBeNull();
    token = data!.token;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect((await guest.client.from("project_inboxes").select("token").eq("project_id", project)).data).toHaveLength(0);
    expect((await outsider.client.from("project_inboxes").select("token").eq("project_id", project)).data).toHaveLength(0);
  });

  it("only the webhook can file email", async () => {
    const args = { p_token: token, p_from: member.email, p_subject: "x", p_text: "x" };
    expect((await member.client.rpc("receive_inbound_email", args)).error).not.toBeNull();
    expect((await visitor.rpc("receive_inbound_email", args)).error).not.toBeNull();
  });

  it("an email from a member becomes a document in the project", async () => {
    const { data, error } = await admin.rpc("receive_inbound_email", {
      p_token: token,
      p_from: member.email.toUpperCase(),
      p_subject: "Pier 3 update",
      p_text: "Ben will book the crane for Monday.",
    });
    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ accepted: true, reason: "ok", project_id: project });
    const doc = await member.client.from("documents").select("title, origin, email_from, raw_text").eq("id", data[0].document_id).single();
    expect(doc.data).toMatchObject({ title: "Pier 3 update", origin: "email", raw_text: "Ben will book the crane for Monday." });
  });

  it("refuses unknown addresses and outside senders unless the manager allows them", async () => {
    const send = (from: string, t = token) => admin.rpc("receive_inbound_email", { p_token: t, p_from: from, p_subject: "Hi", p_text: "Hello" });
    expect((await send(member.email, "0".repeat(32))).data[0]).toMatchObject({ accepted: false, reason: "unknown_address" });
    expect((await send("stranger@example.test")).data[0]).toMatchObject({ accepted: false, reason: "sender_not_allowed" });
    expect((await send(outsider.email)).data[0]).toMatchObject({ accepted: false, reason: "sender_not_allowed" });

    // A member can't open it to outsiders; the project's manager can.
    await member.client.from("project_inboxes").update({ allow_outside_senders: true }).eq("project_id", project);
    expect((await send("stranger@example.test")).data[0].accepted).toBe(false);
    expect((await owner.client.from("project_inboxes").update({ allow_outside_senders: true }).eq("project_id", project)).error).toBeNull();
    expect((await send("stranger@example.test")).data[0]).toMatchObject({ accepted: true, reason: "ok" });
  });
});

describe("weekly reports", () => {
  let shareToken: string;

  it("the project's manager saves a report; members and guests can read it, not write it", async () => {
    const report = { headline: "On track", summary: "Piers poured." };
    const { data, error } = await owner.client
      .from("project_reports")
      .insert({ project_id: project, week_of: "2026-11-23", report })
      .select("share_token, share_expires_at")
      .single<{ share_token: string; share_expires_at: string }>();
    expect(error).toBeNull();
    shareToken = data!.share_token;
    expect(shareToken).toMatch(/^[0-9a-f]{64}$/);
    const days = (Date.parse(data!.share_expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);

    expect((await member.client.from("project_reports").insert({ project_id: project, week_of: "2026-11-16", report })).error).not.toBeNull();
    expect((await guest.client.from("project_reports").select("id").eq("project_id", project)).data).toHaveLength(1);
    expect((await outsider.client.from("project_reports").select("id").eq("project_id", project)).data).toHaveLength(0);
    expect((await member.client.from("report_settings").insert({ project_id: project, enabled: true })).error).not.toBeNull();
    expect((await owner.client.from("report_settings").insert({ project_id: project, enabled: true, recipient_ids: [member.id] })).error).toBeNull();
  });

  it("anyone with the link can read it until it expires", async () => {
    const shared = await visitor.rpc("shared_report", { p_token: shareToken });
    expect(shared.data).toEqual([expect.objectContaining({ project_name: "Bridge", report: { headline: "On track", summary: "Piers poured." } })]);
    expect((await visitor.rpc("shared_report", { p_token: "f".repeat(64) })).data).toEqual([]);

    await owner.client.from("project_reports").update({ share_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("share_token", shareToken);
    expect((await visitor.rpc("shared_report", { p_token: shareToken })).data).toEqual([]);
  });
});

describe("Ask Forgeboard search", () => {
  beforeAll(async () => {
    await owner.client.from("items").insert([
      { project_id: project, type: "decision", title: "Use epoxy grout under the bearings" },
      { project_id: privateProject, type: "decision", title: "Use epoxy anchors on the tower" },
    ]);
  });

  it("finds a recorded decision", async () => {
    const { data, error } = await member.client.rpc("ask_search", { ws, q: "what grout did we decide on", p_limit: 10 });
    expect(error).toBeNull();
    expect(data.some((r: { title: string }) => r.title === "Use epoxy grout under the bearings")).toBe(true);
  });

  it("never returns items from a project the asker can't read", async () => {
    const asGuest = await guest.client.rpc("ask_search", { ws, q: "epoxy", p_limit: 20 });
    expect(asGuest.error).toBeNull();
    const projects = new Set(asGuest.data.map((r: { project_id: string }) => r.project_id));
    expect(projects.has(privateProject)).toBe(false);
    expect(projects.has(project)).toBe(true);

    const asOutsider = await outsider.client.rpc("ask_search", { ws, q: "epoxy", p_limit: 20 });
    expect(asOutsider.data ?? []).toEqual([]);
  });
});
