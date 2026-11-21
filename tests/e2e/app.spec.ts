import { expect, test } from "@playwright/test";
import { WORKSPACE_HOME, demo, hasDemoLogin, logIn, workspaceBase } from "./helpers";

// Signed-in flows, using the seeded demo account. These tests only read data
// and try actions the demo account is locked out of, so they change nothing.

test.skip(!hasDemoLogin, "Set DEMO_PASSWORD (and run `npm run seed:demo`) to run the signed-in tests.");

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("the dashboard lists the demo projects", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
  await expect(page.getByRole("link", { name: "Pump Station Retrofit" }).first()).toBeVisible();
});

test("a project opens in every view", async ({ page }) => {
  await page.getByRole("link", { name: "Pump Station Retrofit" }).first().click();
  await expect(page.getByRole("tablist", { name: "Project views" })).toBeVisible();
  for (const view of ["Overview", "Table", "Board", "Calendar", "Timeline", "Decisions & Risks", "AI Notes"]) {
    await page.getByRole("tab", { name: view }).click();
    await expect(page.getByRole("tab", { name: view })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).not.toBeEmpty();
  }
});

test("a crash in an app page shows the custom error screen", async ({ page }) => {
  await page.goto(`${workspaceBase(page)}/test-error`);
  await expect(page.getByRole("heading", { name: "This page hit an error" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // The app frame survives, so the user can navigate away.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(WORKSPACE_HOME);
});

test("a project that doesn't exist shows the in-app 404", async ({ page }) => {
  await page.goto(`${workspaceBase(page)}/projects/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});

test("old /dashboard links open the same page in the workspace", async ({ page }) => {
  const base = workspaceBase(page);
  await page.goto("/dashboard/my-work");
  await expect(page).toHaveURL(`${base}/my-work`);
});

test("the members page lists the demo user as owner", async ({ page }) => {
  await page.getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  await expect(page.getByText(demo.email).first()).toBeVisible();
  await expect(page.getByText(/\d+ of \d+ seats used/)).toBeVisible();
});

test("settings shows the profile and locks the demo account", async ({ page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Full name")).not.toHaveValue("");
  await expect(page.getByText(demo.email).first()).toBeVisible();
  await expect(page.getByText("shared demo account")).toBeVisible();
  await expect(page.getByLabel("New email")).toBeDisabled();
  await expect(page.getByLabel(/^New password/)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete my account…" })).toBeDisabled();
});

test("logging out returns to the home page and protects the app", async ({ page }) => {
  const base = workspaceBase(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  for (const path of ["/dashboard", base]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
