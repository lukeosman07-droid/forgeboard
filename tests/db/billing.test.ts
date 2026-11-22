import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleStripeEvent, type StripeApi } from "@/lib/billing/stripe-sync";

// Phase 2: plans, limits and billing, enforced by the database. Runs against a
// LOCAL Supabase with every migration applied (see rls.test.ts).
// Covers the phase's acceptance criteria:
//   * a trial workspace turns read-only after day 14 and unlocks on payment,
//   * the 6th seat on Starter is refused,
//   * replaying the same Stripe event changes nothing,
//   * a failed payment starts a 7-day grace period.

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
const DAY = 86_400_000;

type TestUser = { id: string; email: string; client: SupabaseClient };
const users: TestUser[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `billing-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `User ${label}`, company_name: `Company ${label}` },
  });
  if (error || !data.user) throw new Error(`Couldn't create ${label}: ${error?.message}`);
  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Couldn't sign in ${label}: ${signInError.message}`);
  const user = { id: data.user.id, email, client };
  users.push(user);
  return user;
}

async function ownWorkspace(user: TestUser): Promise<string> {
  const { data, error } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner").single();
  if (error || !data) throw new Error(`No workspace for ${user.email}: ${error?.message}`);
  return data.workspace_id as string;
}

async function setWorkspace(id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("workspaces").update(values).eq("id", id);
  if (error) throw new Error(`Couldn't update workspace: ${error.message}`);
}

async function limits(user: TestUser, ws: string) {
  const { data, error } = await user.client.rpc("workspace_limits", { ws }).single<Record<string, unknown>>();
  if (error) throw new Error(`workspace_limits failed: ${error.message}`);
  return data;
}

function invite(user: TestUser, ws: string, email: string, role = "member", project: string | null = null) {
  const hash = createHash("sha256").update(randomBytes(32).toString("base64url"), "utf8").digest("hex");
  return user.client.rpc("create_invite", { p_workspace: ws, p_email: email, p_role: role, p_token_hash: hash, p_project: project });
}

function newProject(user: TestUser, ws: string, name = "Project") {
  return user.client.from("projects").insert({ workspace_id: ws, name }).select("id").single<{ id: string }>();
}

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

let owner: TestUser;
let ws: string;

beforeAll(async () => {
  owner = await createUser("owner");
  ws = await ownWorkspace(owner);
});

afterAll(async () => {
  for (const user of users) {
    const owned = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner");
    for (const row of owned.data ?? []) await admin.from("workspaces").delete().eq("id", row.workspace_id);
    await admin.auth.admin.deleteUser(user.id);
  }
});

describe("plan limits", () => {
  it("a new workspace starts a 14-day trial with the trial limits", async () => {
    const row = await limits(owner, ws);
    expect(row).toMatchObject({ plan: "trial", seats: 5, ai_runs: 50, read_only_reason: null });
    const daysLeft = (Date.parse(row.trial_ends_at as string) - Date.now()) / DAY;
    expect(daysLeft).toBeGreaterThan(13);
    expect(daysLeft).toBeLessThanOrEqual(14);
  });

  it("a member can't give their workspace a plan or change its billing", async () => {
    for (const change of [{ plan: "business" }, { subscription_status: "active" }, { trial_ends_at: ahead(365) }, { grace_ends_at: null }]) {
      const { data, error } = await owner.client.from("workspaces").update(change).eq("id", ws).select("id");
      expect(error || (data ?? []).length === 0, `updating ${Object.keys(change)[0]} should be refused`).toBeTruthy();
    }
    expect((await limits(owner, ws)).plan).toBe("trial");
  });

  it("nobody outside the workspace can read its limits", async () => {
    const stranger = await createUser("stranger");
    const { data, error } = await stranger.client.rpc("workspace_limits", { ws }).maybeSingle();
    expect(error !== null || data === null).toBe(true);
  });
});

describe("trial and read-only", () => {
  it("a trial workspace turns read-only on day 15 and unlocks on payment", async () => {
    const before = await newProject(owner, ws, "Before");
    expect(before.error).toBeNull();

    // Day 15: the trial ended a day ago.
    await setWorkspace(ws, { trial_ends_at: ago(1) });
    expect((await limits(owner, ws)).read_only_reason).toBe("trial_ended");

    const blocked = await newProject(owner, ws, "Blocked");
    expect(blocked.error).not.toBeNull();
    const rename = await owner.client.from("projects").update({ name: "Renamed" }).eq("id", before.data!.id).select("id");
    expect(rename.data ?? []).toHaveLength(0);
    const invited = await invite(owner, ws, `nobody-${stamp}@example.test`);
    expect(invited.error?.message).toContain("read_only");

    // Reading and exporting still work.
    const read = await owner.client.from("projects").select("id").eq("id", before.data!.id);
    expect(read.data).toHaveLength(1);

    // Payment: Stripe's webhook syncs an active Team subscription.
    const { error } = await admin.rpc("sync_workspace_subscription", {
      p_workspace: ws,
      p_customer: `cus_trial_${stamp}`,
      p_subscription: `sub_trial_${stamp}`,
      p_plan: "team",
      p_status: "active",
      p_interval: "month",
      p_period_end: ahead(30),
      p_cancel_at_period_end: false,
    });
    expect(error).toBeNull();
    expect(await limits(owner, ws)).toMatchObject({ plan: "team", read_only_reason: null, seats: 15 });
    expect((await newProject(owner, ws, "After")).error).toBeNull();
  });

  it("a canceled subscription leaves the workspace read-only, never deleted", async () => {
    const { error } = await admin.rpc("sync_workspace_subscription", {
      p_workspace: ws,
      p_customer: `cus_trial_${stamp}`,
      p_subscription: `sub_trial_${stamp}`,
      p_plan: null,
      p_status: "canceled",
      p_interval: null,
      p_period_end: null,
      p_cancel_at_period_end: false,
    });
    expect(error).toBeNull();
    expect((await limits(owner, ws)).read_only_reason).toBe("subscription_ended");
    const { data } = await owner.client.from("projects").select("id").eq("workspace_id", ws);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("seats", () => {
  it("the 6th seat on Starter is refused; guests are free", async () => {
    const starterOwner = await createUser("starter");
    const starter = await ownWorkspace(starterOwner);
    await setWorkspace(starter, { plan: "starter", subscription_status: "active" });

    // The owner holds one seat; four pending invites fill the other four.
    for (let i = 1; i <= 4; i++) {
      const { error } = await invite(starterOwner, starter, `seat-${i}-${stamp}@example.test`);
      expect(error, `invite ${i}`).toBeNull();
    }
    const sixth = await invite(starterOwner, starter, `seat-6-${stamp}@example.test`);
    expect(sixth.error?.message).toContain("seat_limit");

    const project = await newProject(starterOwner, starter);
    expect(project.error).toBeNull();
    const guest = await invite(starterOwner, starter, `guest-${stamp}@example.test`, "guest", project.data!.id);
    expect(guest.error).toBeNull();
  });
});

describe("failed payments", () => {
  let paid: string;
  let paidOwner: TestUser;
  const customer = `cus_grace_${stamp}`;

  beforeAll(async () => {
    paidOwner = await createUser("grace");
    paid = await ownWorkspace(paidOwner);
    await setWorkspace(paid, { plan: "business", subscription_status: "active", stripe_customer_id: customer, stripe_subscription_id: `sub_grace_${stamp}` });
  });

  it("a failed payment starts a 7-day grace period that a retry doesn't extend", async () => {
    const failedAt = new Date();
    const first = await admin.rpc("record_payment_failed", { p_customer: customer, p_failed_at: failedAt.toISOString() });
    expect(first.error).toBeNull();
    expect(first.data).toBe(paid);

    const row = await limits(paidOwner, paid);
    expect(Date.parse(row.grace_ends_at as string)).toBe(failedAt.getTime() + 7 * DAY);
    expect(row.read_only_reason).toBeNull(); // still fully usable during grace

    await admin.rpc("record_payment_failed", { p_customer: customer, p_failed_at: new Date(failedAt.getTime() + 3 * DAY).toISOString() });
    expect(Date.parse((await limits(paidOwner, paid)).grace_ends_at as string)).toBe(failedAt.getTime() + 7 * DAY);
  });

  it("the workspace turns read-only when grace runs out, and unlocks when an invoice is paid", async () => {
    await setWorkspace(paid, { grace_ends_at: ago(1) });
    expect((await limits(paidOwner, paid)).read_only_reason).toBe("payment_failed");
    expect((await newProject(paidOwner, paid)).error).not.toBeNull();

    const { error } = await admin.rpc("record_payment_succeeded", { p_customer: customer });
    expect(error).toBeNull();
    expect(await limits(paidOwner, paid)).toMatchObject({ read_only_reason: null, grace_ends_at: null });
  });

  it("replaying the same Stripe event changes nothing", async () => {
    await setWorkspace(paid, { grace_ends_at: null });
    const fakeStripe: StripeApi = {
      subscriptions: {
        retrieve: () => Promise.reject(new Error("not used by invoice events")),
      },
    };
    const created = Math.floor(Date.now() / 1000) - 3600;
    const event = {
      id: `evt_replay_${stamp}`,
      type: "invoice.payment_failed",
      created,
      data: { object: { customer } },
    } as unknown as Stripe.Event;

    let emails = 0;
    const deps = { stripe: fakeStripe, admin, onPaymentFailed: async () => void emails++ };
    expect(await handleStripeEvent(event, deps)).toBe("processed");
    const after1 = await admin.from("workspaces").select("grace_ends_at").eq("id", paid).single();

    // A later failure sets nothing new either: grace counts from the first one.
    expect(await handleStripeEvent(event, deps)).toBe("duplicate");
    const after2 = await admin.from("workspaces").select("grace_ends_at").eq("id", paid).single();

    expect(Date.parse(after1.data!.grace_ends_at)).toBe((created + 7 * 86_400) * 1000);
    expect(after2.data!.grace_ends_at).toBe(after1.data!.grace_ends_at);
    expect(emails).toBe(1);
    const { data: recorded } = await admin.from("stripe_events").select("id").eq("id", event.id);
    expect(recorded).toHaveLength(1);
  });

  it("users can't read or write processed Stripe events", async () => {
    const read = await paidOwner.client.from("stripe_events").select("id");
    expect(read.data ?? []).toHaveLength(0);
    const write = await paidOwner.client.from("stripe_events").insert({ id: `evt_forged_${stamp}`, type: "x" });
    expect(write.error).not.toBeNull();
  });
});

describe("AI runs", () => {
  let aiOwner: TestUser;
  let aiWs: string;

  beforeAll(async () => {
    aiOwner = await createUser("ai");
    aiWs = await ownWorkspace(aiOwner);
  });

  it("users can't claim or finish AI runs themselves, or write the usage log", async () => {
    const claim = await aiOwner.client.rpc("claim_ai_use", { p_workspace: aiWs, p_user: aiOwner.id, p_feature: "extract", p_hourly_limit: 999 });
    expect(claim.error).not.toBeNull();
    const finish = await aiOwner.client.rpc("finish_ai_use", { p_usage_id: 1, p_status: "failed", p_model: null, p_input_tokens: null, p_output_tokens: null, p_latency_ms: null });
    expect(finish.error).not.toBeNull();
    const write = await aiOwner.client.from("ai_usage").insert({ workspace_id: aiWs, user_id: aiOwner.id, feature: "extract" });
    expect(write.error).not.toBeNull();
  });

  it("counts runs per workspace per month and stops at the plan's limit", async () => {
    const claim = () => admin.rpc("claim_ai_use", { p_workspace: aiWs, p_user: aiOwner.id, p_feature: "extract", p_hourly_limit: 999 }).single<{ allowed: boolean; reason: string; usage_id: number; runs_left: number }>();

    const first = await claim();
    expect(first.data).toMatchObject({ allowed: true, reason: "ok", runs_left: 49 });

    // A failed run is given back.
    await admin.rpc("finish_ai_use", { p_usage_id: first.data!.usage_id, p_status: "failed", p_model: null, p_input_tokens: null, p_output_tokens: null, p_latency_ms: null });
    expect((await limits(aiOwner, aiWs)).ai_runs_used).toBe(0);

    // Use up the trial's 50 runs.
    const rows = Array.from({ length: 50 }, () => ({ workspace_id: aiWs, user_id: aiOwner.id, feature: "extract", status: "succeeded" }));
    expect((await admin.from("ai_usage").insert(rows)).error).toBeNull();
    expect((await claim()).data).toMatchObject({ allowed: false, reason: "limit_reached" });

    // Last month's runs don't count.
    await admin.from("ai_usage").update({ created_at: ago(40) }).eq("workspace_id", aiWs);
    expect((await claim()).data).toMatchObject({ allowed: true });
  });

  it("admins can read their workspace's usage; members can't", async () => {
    const { data } = await aiOwner.client.from("ai_usage").select("id").eq("workspace_id", aiWs);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("deleting a workspace", () => {
  it("only the owner, with the exact name, after billing is canceled", async () => {
    const delOwner = await createUser("delete");
    const target = await ownWorkspace(delOwner);
    const { data: wsRow } = await admin.from("workspaces").select("name").eq("id", target).single();
    const name = wsRow!.name as string;

    const stranger = await createUser("delete-stranger");
    const notOwner = await stranger.client.rpc("delete_workspace", { p_workspace: target, p_confirm_name: name });
    expect(notOwner.error).not.toBeNull();

    const wrongName = await delOwner.client.rpc("delete_workspace", { p_workspace: target, p_confirm_name: "Something else" });
    expect(wrongName.error?.message).toContain("confirm_name_mismatch");

    await setWorkspace(target, { plan: "team", subscription_status: "active", stripe_subscription_id: `sub_del_${stamp}` });
    const live = await delOwner.client.rpc("delete_workspace", { p_workspace: target, p_confirm_name: name });
    expect(live.error?.message).toContain("cancel_subscription_first");

    await setWorkspace(target, { subscription_status: "canceled" });
    const ok = await delOwner.client.rpc("delete_workspace", { p_workspace: target, p_confirm_name: `  ${name} ` });
    expect(ok.error).toBeNull();
    const { data: gone } = await admin.from("workspaces").select("id").eq("id", target);
    expect(gone).toHaveLength(0);
  });
});
