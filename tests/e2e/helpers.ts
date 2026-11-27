import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const MAILBOX = process.env.E2E_MAILBOX_URL ?? "http://127.0.0.1:54334";

/** Waits for the newest email to `to` in the local test inbox and returns the first link in it. */
export async function linkFromEmail(to: string): Promise<string> {
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

/**
 * Marks the workspaces these users own as past onboarding, so logging in lands
 * on the workspace home. (Users made with the admin API skip the sign-up page,
 * and a brand-new workspace's owner is otherwise sent to /onboarding.)
 */
export async function markOnboarded(admin: SupabaseClient, userIds: string[]) {
  const { data } = await admin.from("workspace_members").select("workspace_id").in("user_id", userIds).eq("role", "owner");
  const ids = (data ?? []).map((m) => m.workspace_id as string);
  if (ids.length === 0) return;
  const { error } = await admin.from("workspaces").update({ onboarded_at: new Date().toISOString() }).in("id", ids);
  if (error) throw new Error(`Couldn't mark workspaces onboarded: ${error.message}`);
}
