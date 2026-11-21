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
  // /dashboard forwards to the workspace opened last: /w/<slug>.
  await expect(page).toHaveURL(WORKSPACE_HOME);
}

/** A workspace home page, e.g. /w/demo-engineering-co */
export const WORKSPACE_HOME = /\/w\/[a-z0-9-]+$/;

/** The /w/<slug> prefix of the page the browser is on. */
export function workspaceBase(page: Page) {
  const match = new URL(page.url()).pathname.match(/^\/w\/[a-z0-9-]+/);
  if (!match) throw new Error(`Not on a workspace page: ${page.url()}`);
  return match[0];
}
