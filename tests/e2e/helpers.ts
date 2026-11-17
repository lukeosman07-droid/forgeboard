import { expect, type Page } from "@playwright/test";

// The seeded demo account (npm run seed:demo). Its login comes from the
// environment so no password lives in the repo.
export const demo = {
  email: process.env.DEMO_EMAIL ?? "demo@demo.com",
  password: process.env.DEMO_PASSWORD ?? "",
};

export const hasDemoLogin = demo.password.length > 0;

export async function logIn(page: Page, email = demo.email, password = demo.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
