import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { logIn, markOnboarded } from "./helpers";

// Phase 5 acceptance, on a fresh trial workspace (every feature is on):
//   * an RFI is created from an extracted question in two clicks and shows days open,
//   * moving a predecessor's date flags its successor,
//   * a saved view reloads with the same filters from its URL,
//   * the workload view matches a count done by hand.
// Needs a LOCAL Supabase, like collaboration.spec.ts: it creates a user.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

test.skip(!isLocal || !serviceKey, "Needs a local Supabase: this test creates a user.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const PASSWORD = "engineering-password-123";
const eve = { email: `e2e-eng-${stamp}@example.test`, id: "" };
let slug = "";
let projectId = "";
const ids: Record<string, string> = {};

// YYYY-MM-DD `days` from today, in the browser's (and this machine's) time zone.
function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The hand count for the workload test. Kim: survey (this week), design (in
// a few weeks), and the one with no date = 3. Lee: the overdue valves = 1.
// Not counted: Lee's done task, Kim's task months out, and the question.
const TASKS = [
  { title: "Survey the outfall", assignee: "Kim", priority: "medium", start: 0, due: 5, status: "open" },
  { title: "Design the outfall upgrade", assignee: "Kim", priority: "medium", start: 10, due: 20, status: "open" },
  { title: "Order isolation valves", assignee: "Lee", priority: "high", start: -6, due: -2, status: "open" },
  { title: "Write the O&M checklist", assignee: "Kim", priority: "low", start: null, due: null, status: "open" },
  { title: "Collect site photos", assignee: "Lee", priority: "low", start: -9, due: -4, status: "done" },
  { title: "Plan next year's maintenance", assignee: "Kim", priority: "low", start: 100, due: 120, status: "open" },
];
const QUESTION = "Is the existing outfall rated for the new peak flow?";

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: eve.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Eve Engineer" },
  });
  if (error || !data.user) throw new Error(`Couldn't create the test user: ${error?.message}`);
  eve.id = data.user.id;
  await markOnboarded(admin, [eve.id]);
  const { data: membership } = await admin.from("workspace_members").select("workspace_id, workspaces(slug)").eq("user_id", eve.id).eq("role", "owner").single();
  const workspaceId = membership!.workspace_id as string;
  slug = (membership!.workspaces as unknown as { slug: string }).slug;

  const project = await admin.from("projects").insert({ workspace_id: workspaceId, created_by: eve.id, name: "Riverside Lift Station" }).select("id").single();
  if (project.error) throw new Error(project.error.message);
  projectId = project.data.id as string;

  const rows = [
    ...TASKS.map((t, i) => ({
      project_id: projectId,
      created_by: eve.id,
      type: "action_item",
      title: t.title,
      assignee: t.assignee,
      priority: t.priority,
      status: t.status,
      start_date: t.start === null ? null : inDays(t.start),
      due_date: t.due === null ? null : inDays(t.due),
      position: i + 1,
    })),
    { project_id: projectId, created_by: eve.id, type: "question", title: QUESTION, assignee: null, priority: null, status: "open", start_date: null, due_date: null, position: 99 },
  ];
  const items = await admin.from("items").insert(rows).select("id, title");
  if (items.error) throw new Error(items.error.message);
  for (const i of items.data) ids[i.title as string] = i.id as string;

  // The design waits on the survey; today the dates fit.
  const dep = await admin
    .from("item_dependencies")
    .insert({ project_id: projectId, created_by: eve.id, predecessor_id: ids["Survey the outfall"], successor_id: ids["Design the outfall upgrade"] });
  if (dep.error) throw new Error(dep.error.message);
});

test.afterAll(async () => {
  if (!eve.id) return;
  const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", eve.id).eq("role", "owner");
  await admin.from("workspaces").delete().in("id", (data ?? []).map((w) => w.workspace_id));
  await admin.auth.admin.deleteUser(eve.id).catch(() => {});
});

test.beforeEach(async ({ page }) => {
  await logIn(page, eve.email, PASSWORD);
});

test("an RFI is created from an extracted question in two clicks", async ({ page }) => {
  await page.goto(`/w/${slug}/projects/${projectId}`);
  const rfiTab = page.getByRole("tab", { name: "RFIs" });
  // Retry until the page is interactive: clicks before hydration do nothing.
  await expect(async () => {
    await rfiTab.click({ timeout: 2_000 }); // 1
    await expect(rfiTab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  const questions = page.getByRole("region", { name: "Open questions without an RFI" });
  await expect(questions).toContainText(QUESTION);
  await questions.getByRole("button", { name: "Create RFI" }).click(); // 2

  await expect(page.getByTestId("days-open")).toHaveText("0 days open");
  await expect(page.getByText("RFI-001").first()).toBeVisible();
  await expect(page).toHaveURL(/view=rfis&rfi=/);

  const { data: rfi } = await admin.from("rfis").select("subject, status, source_item_id").eq("project_id", projectId).single();
  expect(rfi).toMatchObject({ subject: QUESTION, status: "open", source_item_id: ids[QUESTION] });

  // The question now links to its RFI instead of offering a new one.
  await expect(questions).toHaveCount(0);
  await page.goto(`/w/${slug}/projects/${projectId}?view=log`);
  const riskTab = page.getByRole("button", { name: /^Risks & Questions/ });
  await expect(async () => {
    await riskTab.click({ timeout: 2_000 });
    await expect(riskTab).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Open RFI-001" })).toBeVisible();
});

test("moving a predecessor's due date flags its successor", async ({ page }) => {
  await page.goto(`/w/${slug}/projects/${projectId}?view=table`);
  const successorRow = page.locator("[data-conflict]", { hasText: "Design the outfall upgrade" });
  await expect(page.getByRole("button", { name: "Design the outfall upgrade" })).toBeVisible();
  await expect(successorRow).toHaveCount(0);

  // Push the survey past the day the design starts.
  await page.goto(`/w/${slug}/projects/${projectId}?view=table&task=${ids["Survey the outfall"]}`);
  const drawer = page.getByRole("dialog", { name: "Task details" });
  // The History list loads once the panel is interactive.
  await expect(drawer.getByRole("list", { name: "History" })).toBeVisible({ timeout: 15_000 });
  await drawer.getByLabel("Due date").fill(inDays(15));
  await drawer.getByRole("button", { name: "Close", exact: true }).click();

  await expect(successorRow).toBeVisible();
  await expect(successorRow.getByText("⚠ Conflict")).toBeVisible();
  await expect(page.getByText(/Design the outfall upgrade \(waits on Survey the outfall\)/)).toBeVisible();
  // It's saved, so it survives a reload.
  await expect
    .poll(async () => (await admin.from("items").select("due_date").eq("id", ids["Survey the outfall"]).single()).data?.due_date)
    .toBe(inDays(15));
  await page.reload();
  await expect(page.locator("[data-conflict]", { hasText: "Design the outfall upgrade" })).toBeVisible();
});

test("a saved view reloads with the same filters from its URL", async ({ page }) => {
  await page.goto(`/w/${slug}/projects/${projectId}?view=table&priority=high`);
  await expect(page.getByRole("button", { name: "Order isolation valves" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write the O&M checklist" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Views/ }).click();
  await page.getByLabel("Saved view name").fill("High priority");
  await page.getByRole("button", { name: "Save view" }).click();

  // Start from the unfiltered table, then open the saved view.
  await page.goto(`/w/${slug}/projects/${projectId}?view=table`);
  await expect(page.getByRole("button", { name: "Write the O&M checklist" })).toBeVisible();
  await page.getByRole("button", { name: /^Views/ }).click();
  await page.getByRole("button", { name: /^High priority/ }).click();
  await expect(page).toHaveURL(/priority=high/);
  await expect(page.getByRole("button", { name: "Write the O&M checklist" })).toHaveCount(0);

  // The URL alone brings back the same filters.
  const link = page.url();
  await page.goto("about:blank");
  await page.goto(link);
  await expect(page.getByRole("button", { name: "Order isolation valves" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write the O&M checklist" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filters · 1/ })).toBeVisible();
});

test("the workload view matches a count by hand", async ({ page }) => {
  await page.goto(`/w/${slug}/workload`);
  const table = page.getByRole("table", { name: "Workload" });
  await expect(table).toBeVisible();
  await expect(table.locator('[data-person="Kim"] [data-total]')).toHaveText("3");
  await expect(table.locator('[data-person="Lee"] [data-total]')).toHaveText("1");
  await expect(table.locator("[data-grand-total]")).toHaveText("4");
});
