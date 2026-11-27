import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { logIn, markOnboarded } from "./helpers";

// Phase 3 acceptance, in two real browsers on one project:
//   * each sees the other's edits within 2 seconds,
//   * the task panel shows who changed the due date and when,
//   * a mention notifies the person (bell), and search finds the task by a
//     word in that comment.
// Needs a LOCAL Supabase (with Realtime), like account.spec.ts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

test.skip(!isLocal || !serviceKey, "Needs a local Supabase: this test creates users.");

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const stamp = Date.now();
const PASSWORD = "collab-password-123";
const ada = { email: `e2e-ada-${stamp}@example.test`, name: "Ada Lovelace", id: "" };
const ben = { email: `e2e-ben-${stamp}@example.test`, name: "Ben Builder", id: "" };
let slug = "";
let projectId = "";
let taskId = "";

test.beforeAll(async () => {
  for (const person of [ada, ben]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: person.name },
    });
    if (error || !data.user) throw new Error(`Couldn't create ${person.name}: ${error?.message}`);
    person.id = data.user.id;
  }
  await markOnboarded(admin, [ada.id, ben.id]);
  const { data: membership } = await admin.from("workspace_members").select("workspace_id, workspaces(slug)").eq("user_id", ada.id).eq("role", "owner").single();
  const workspaceId = membership!.workspace_id as string;
  slug = (membership!.workspaces as unknown as { slug: string }).slug;
  await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: ben.id, role: "member" });
  const project = await admin.from("projects").insert({ workspace_id: workspaceId, name: "Harbor Bridge" }).select("id").single();
  projectId = project.data!.id as string;
  const task = await admin
    .from("items")
    .insert({ project_id: projectId, workspace_id: workspaceId, type: "action_item", title: "Inspect bearings", due_date: "2026-12-01" })
    .select("id")
    .single();
  if (task.error) throw new Error(task.error.message);
  taskId = task.data!.id as string;
});

test.afterAll(async () => {
  for (const person of [ada, ben]) {
    if (!person.id) continue;
    const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", person.id).eq("role", "owner");
    await admin.from("workspaces").delete().in("id", (data ?? []).map((w) => w.workspace_id));
    await admin.auth.admin.deleteUser(person.id).catch(() => {});
  }
});

async function signedIn(browser: Browser, person: { email: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logIn(page, person.email, PASSWORD);
  return page;
}

test("two people on one project see each other's work live", async ({ browser }) => {
  test.setTimeout(120_000);
  const adaPage = await signedIn(browser, ada);
  const benPage = await signedIn(browser, ben);
  const projectUrl = `/w/${slug}/projects/${projectId}?view=table`;
  await Promise.all([adaPage.goto(projectUrl), benPage.goto(projectUrl)]);

  // Both are connected once each sees the other in the project header.
  await expect(adaPage.getByLabel(`Also viewing: ${ben.name}`)).toBeVisible({ timeout: 20_000 });
  await expect(benPage.getByLabel(`Also viewing: ${ada.name}`)).toBeVisible({ timeout: 20_000 });

  // 1. Ada renames the task; Ben's table shows it within 2 seconds of the save.
  await adaPage.goto(`/w/${slug}/projects/${projectId}?view=table&task=${taskId}`);
  const title = adaPage.getByRole("dialog", { name: "Task details" }).getByLabel("Task name");
  await title.fill("Inspect bearings and grout");
  await title.press("Enter");
  await expect
    .poll(async () => (await admin.from("items").select("title").eq("id", taskId).single()).data?.title, { timeout: 10_000, intervals: [50] })
    .toBe("Inspect bearings and grout");
  const savedAt = Date.now();
  await expect(benPage.getByText("Inspect bearings and grout").first()).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - savedAt).toBeLessThan(2_000);

  // 2. Ben moves the due date while Ada has the task open: her panel's history
  //    names him and the old and new dates.
  const benDb = createClient(url, anonKey, options);
  await benDb.auth.signInWithPassword({ email: ben.email, password: PASSWORD });
  const moved = await benDb.from("items").update({ due_date: "2026-12-05" }).eq("id", taskId);
  expect(moved.error).toBeNull();
  const panel = adaPage.getByRole("dialog", { name: "Task details" });
  const history = panel.getByRole("list", { name: "History" });
  await expect(history.getByText(/changed the due date from Dec 1 to Dec 5/)).toBeVisible({ timeout: 5_000 });
  await expect(history.getByRole("listitem").filter({ hasText: "changed the due date" })).toContainText(ben.name);

  // 3. Ben mentions Ada in an update, picking her from the suggestions.
  await benPage.goto(`/w/${slug}/projects/${projectId}?view=table&task=${taskId}`);
  const box = benPage.getByRole("dialog", { name: "Task details" }).getByLabel("Write an update");
  await box.click();
  await box.pressSequentially("The grout is cured, ");
  await box.pressSequentially("@Ada");
  await benPage.getByRole("option", { name: /Ada Lovelace/ }).click();
  await box.pressSequentially("please sign off.");
  await benPage.getByRole("button", { name: "Post" }).click();
  const posted = benPage.getByRole("dialog", { name: "Task details" }).locator("[data-mention]");
  await expect(posted).toHaveText("@Ada Lovelace");

  // Ada's bell lights up, and the Inbox has the mention.
  await expect(adaPage.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible({ timeout: 10_000 });
  await adaPage.goto(`/w/${slug}/inbox`);
  await expect(adaPage.getByText(`${ben.name} mentioned you`)).toBeVisible();

  // 4. Search finds the task by a word that's only in the comment.
  await adaPage.keyboard.press("Control+k");
  await adaPage.getByRole("textbox", { name: "Search", exact: true }).fill("cured");
  const result = adaPage.getByRole("listbox", { name: "Results" }).getByRole("option").filter({ hasText: "Inspect bearings and grout" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Comment on");
  await result.click();
  await expect(adaPage).toHaveURL(new RegExp(`task=${taskId}`));
  await expect(adaPage.getByRole("dialog", { name: "Task details" }).getByLabel("Task name")).toHaveValue("Inspect bearings and grout");
});
