import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { linkFromEmail } from "./helpers";

// Phase 2 acceptance: a new signup reaches a populated project in under 3
// minutes. Signs up for real, confirms the email from the local test inbox,
// and goes through onboarding. Needs a LOCAL Supabase, like account.spec.ts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

test.skip(!isLocal || !serviceKey, "Needs a local Supabase: this test creates a user.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `e2e-signup-${Date.now()}@example.test`;
const LIMIT_MS = 3 * 60_000;

test.afterAll(async () => {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = users?.users.find((u) => u.email === email);
  if (!user) return;
  const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner");
  await admin.from("workspaces").delete().in("id", (data ?? []).map((w) => w.workspace_id));
  await admin.auth.admin.deleteUser(user.id).catch(() => {});
});

test("a new signup reaches a populated project in under 3 minutes", async ({ page }) => {
  test.setTimeout(LIMIT_MS + 30_000);
  const started = Date.now();

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Nina New");
  await page.getByLabel("Company").fill("Northwind Civil");
  await page.getByLabel("Work email").fill(email);
  await page.locator('input[name="password"]:visible').fill("signup-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  // Confirming the email signs them in and starts onboarding.
  await page.goto(await linkFromEmail(email));
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+\/onboarding$/);

  // 1. Name the workspace.
  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("Northwind Civil");
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Start from the sample project.
  await expect(page.getByRole("heading", { name: "Start your first project" })).toBeVisible();
  await page.getByRole("radio", { name: /Sample project/ }).click();
  await page.getByRole("button", { name: "Open the sample project" }).click();

  // 3. Skip inviting for now.
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  // The sample project, filled in.
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+\/projects\/[0-9a-f-]+\?view=overview$/);
  await expect(page.getByText("Sample: Pump Station Retrofit").first()).toBeVisible();
  await expect(page.getByText(/of \d+ tasks/)).toBeVisible();

  const elapsed = Date.now() - started;
  expect(elapsed, `took ${Math.round(elapsed / 1000)}s`).toBeLessThan(LIMIT_MS);

  // Onboarding is done: the workspace home opens straight away now, on a 14-day trial.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/);
  await expect(page.getByText(/Free trial/).first()).toBeVisible();
});
