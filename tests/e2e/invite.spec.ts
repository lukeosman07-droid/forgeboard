import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, workspaceBase } from "./helpers";

// Phase 1 acceptance, in the browser:
//   * A invites B, B accepts and sees A's projects.
//   * A shares one project with guest G; G sees only that project and can't edit tasks.
// Creates and deletes real users, so it needs a LOCAL Supabase like account.spec.ts.
// Email isn't configured in tests, so the invite link is read from the page.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

test.skip(!isLocal || !serviceKey, "Needs a local Supabase: these tests create and delete users.");
test.describe.configure({ mode: "serial" });

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = "invite-password-123";
const stamp = Date.now();
const people = {
  a: { email: `e2e-owner-${stamp}@example.test`, name: "Ada Owner" },
  b: { email: `e2e-member-${stamp}@example.test`, name: "Ben Member" },
  g: { email: `e2e-guest-${stamp}@example.test`, name: "Gia Guest" },
};
const ids: string[] = [];
let workspaceId: string;
let sharedProject: string;

test.beforeAll(async () => {
  for (const person of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: person.name },
    });
    if (error || !data.user) throw new Error(`Couldn't create ${person.email}: ${error?.message}`);
    ids.push(data.user.id);
  }
  const { data: membership } = await admin.from("workspace_members").select("workspace_id").eq("user_id", ids[0]).single();
  workspaceId = membership!.workspace_id;
  const insert = async (name: string) =>
    (await admin.from("projects").insert({ workspace_id: workspaceId, created_by: ids[0], name }).select("id").single()).data!.id as string;
  sharedProject = await insert("Shared Bridge Design");
  await insert("Internal Budget");
  await admin.from("items").insert({ project_id: sharedProject, created_by: ids[0], type: "action_item", title: "Check pier loads" });
});

test.afterAll(async () => {
  const { data } = await admin.from("workspace_members").select("workspace_id").in("user_id", ids).eq("role", "owner");
  await admin.from("workspaces").delete().in("id", (data ?? []).map((w) => w.workspace_id));
  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));
});

async function logOut(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function accept(page: Page, link: string, email: string) {
  await page.goto(link);
  await expect(page.getByRole("heading", { name: /^Join / })).toBeVisible();
  await page.getByRole("link", { name: "I already have an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("button", { name: "Accept invite" }).click();
}

test("an owner invites a member, who accepts and sees the projects", async ({ page }) => {
  await logIn(page, people.a.email, PASSWORD);
  const base = workspaceBase(page);
  await page.goto(`${base}/members`);
  await page.getByLabel("Email addresses").fill(people.b.email);
  await page.getByRole("button", { name: "Send invites" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
  await expect(page.locator("section", { hasText: "Pending invites" }).getByText(people.b.email)).toBeVisible();
  await logOut(page);

  await accept(page, link, people.b.email);
  await expect(page).toHaveURL(new RegExp(`${base}$`));
  await expect(page.getByRole("link", { name: "Shared Bridge Design" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Internal Budget" }).first()).toBeVisible();

  // The link is single-use.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This invite isn't valid" })).toBeVisible();
});

test("a guest sees only the shared project and can't edit tasks", async ({ page }) => {
  await logIn(page, people.a.email, PASSWORD);
  await page.goto(`${workspaceBase(page)}/projects/${sharedProject}`);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("Guest's email").fill(people.g.email);
  await page.getByRole("button", { name: "Invite guest" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  await page.keyboard.press("Escape");
  await logOut(page);

  await accept(page, link, people.g.email);
  await expect(page).toHaveURL(new RegExp(`/projects/${sharedProject}`));
  await expect(page.getByLabel("Project name")).toHaveValue("Shared Bridge Design");
  await expect(page.getByLabel("Project name")).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Internal Budget" })).toHaveCount(0);

  const { data } = await admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", ids[2]).single();
  expect(data?.role).toBe("guest");
});
