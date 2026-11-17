import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { logIn } from "./helpers";

// Account flows that create, change and delete a real user and read the emails
// Supabase sends. They need a LOCAL Supabase (`npx supabase start`), whose mail
// lands in a test inbox instead of being delivered. CI runs them on every pull
// request; they are skipped when pointed at a hosted project.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
const MAILBOX = process.env.E2E_MAILBOX_URL ?? "http://127.0.0.1:54324";

test.skip(!isLocal || !serviceKey, "Needs a local Supabase: these tests create and delete users.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const FIRST_PASSWORD = "first-password-123";
const NEW_PASSWORD = "second-password-456";
const email = `e2e-${Date.now()}@example.test`;
let userId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIRST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Reset Tester" },
  });
  if (error || !data.user) throw new Error(`Couldn't create the test user: ${error?.message}`);
  userId = data.user.id;
});

test.afterAll(async () => {
  // Already gone if the delete-account test passed; this covers a failed run.
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
});

/** Waits for the newest email to `to` in the local test inbox and returns the first link in it. */
async function linkFromEmail(to: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILBOX}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILBOX}/api/v1/message/${id}`).then((r) => r.json());
      const link = String(message.HTML ?? message.Text ?? "").match(/https?:\/\/[^\s"'<>]+/)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email with a link arrived for ${to}`);
}

test("a forgotten password can be reset from the emailed link", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link is on its way");

  await page.goto(await linkFromEmail(email));
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

  // Mismatched and too-short passwords are refused.
  await page.getByLabel(/^New password/).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(`${NEW_PASSWORD}x`);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();

  await page.getByLabel(/^New password/).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\?notice=password-updated/);
  await expect(page.getByText("Your password has been changed")).toBeVisible();

  // The old password no longer works; the new one does.
  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(FIRST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  await logIn(page, email, NEW_PASSWORD);
});

test("the reset form gives the same answer for an unknown email", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link is on its way");
});

test("the profile can be edited in settings", async ({ page }) => {
  await logIn(page, email, NEW_PASSWORD);
  await page.goto("/dashboard/settings");
  await page.getByLabel("Full name").fill("Renamed Tester");
  await page.getByLabel("Company").fill("Test Engineering");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");

  const { data } = await admin.from("profiles").select("full_name, company_name").eq("id", userId).single();
  expect(data).toEqual({ full_name: "Renamed Tester", company_name: "Test Engineering" });
});

test("changing the password needs the current one", async ({ page }) => {
  await logIn(page, email, NEW_PASSWORD);
  await page.goto("/dashboard/settings");

  await page.getByLabel("Current password").nth(1).fill("not-my-password");
  await page.getByLabel(/^New password/).fill(FIRST_PASSWORD);
  await page.getByLabel("Repeat new password").fill(FIRST_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not your current password" })).toBeVisible();

  await page.getByLabel("Current password").nth(1).fill(NEW_PASSWORD);
  await page.getByLabel(/^New password/).fill(FIRST_PASSWORD);
  await page.getByLabel("Repeat new password").fill(FIRST_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
});

test("an account can be deleted, taking its data with it", async ({ page }) => {
  const { data: project } = await admin.from("projects").insert({ owner_id: userId, name: "Doomed project" }).select("id").single();

  await logIn(page, email, FIRST_PASSWORD);
  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "Delete my account…" }).click();

  await page.getByLabel("Enter your password to confirm").fill("not-my-password");
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not your current password" })).toBeVisible();

  await page.getByLabel("Enter your password to confirm").fill(FIRST_PASSWORD);
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page).toHaveURL(/\/login\?notice=account-deleted/);
  await expect(page.getByRole("status")).toContainText("have been deleted");

  const { data: user } = await admin.auth.admin.getUserById(userId);
  expect(user.user).toBeNull();
  const { data: left } = await admin.from("projects").select("id").eq("id", project!.id);
  expect(left).toHaveLength(0);
});
