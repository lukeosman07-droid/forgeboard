import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, markOnboarded } from "./helpers";

// Phase 4 acceptance in the browser:
//   * a forwarded email appears in the project as a document within a minute,
//   * an upload past the storage quota is refused with a clear message.
// Needs a LOCAL Supabase (with Storage) and INBOUND_EMAIL_SECRET/DOMAIN set
// for the app under test, like CI does.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const secret = process.env.INBOUND_EMAIL_SECRET ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

test.skip(!isLocal || !serviceKey || !anonKey, "Needs a local Supabase: this test creates users.");

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const stamp = Date.now();
const PASSWORD = "files-password-123";
const ada = { email: `e2e-files-${stamp}@example.test`, id: "" };
let slug = "";
let workspaceId = "";
let projectId = "";
let taskId = "";

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: ada.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Ada Files" } });
  if (error || !data.user) throw new Error(`Couldn't create the test user: ${error?.message}`);
  ada.id = data.user.id;
  await markOnboarded(admin, [ada.id]);
  const { data: membership } = await admin.from("workspace_members").select("workspace_id, workspaces(slug)").eq("user_id", ada.id).eq("role", "owner").single();
  workspaceId = membership!.workspace_id as string;
  slug = (membership!.workspaces as unknown as { slug: string }).slug;
  const project = await admin.from("projects").insert({ workspace_id: workspaceId, name: "Harbor Bridge" }).select("id").single();
  projectId = project.data!.id as string;
  const task = await admin.from("items").insert({ project_id: projectId, workspace_id: workspaceId, type: "action_item", title: "Inspect bearings" }).select("id").single();
  taskId = task.data!.id as string;
});

test.afterAll(async () => {
  if (!ada.id) return;
  const files = await admin.from("attachments").select("storage_path").eq("workspace_id", workspaceId);
  const paths = (files.data ?? []).map((f) => f.storage_path as string);
  if (paths.length) await admin.storage.from("attachments").remove(paths);
  await admin.from("workspaces").delete().eq("id", workspaceId);
  await admin.auth.admin.deleteUser(ada.id).catch(() => {});
});

async function openInbox(page: Page) {
  await page.goto(`/w/${slug}/projects/${projectId}?view=notes`);
  const toggle = page.getByRole("button", { name: /AI Capture/ });
  const tab = page.getByRole("tablist", { name: "Capture from" }).getByRole("tab", { name: "Project inbox" });
  // Retry until the page is interactive: clicks before hydration do nothing.
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await tab.click({ timeout: 2_000 });
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test("a forwarded email shows up in the project inbox within a minute", async ({ page, request }) => {
  test.skip(!secret, "INBOUND_EMAIL_SECRET isn't set for this run.");
  await logIn(page, ada.email, PASSWORD);
  await openInbox(page);
  await page.getByRole("button", { name: "Turn on the inbox" }).click();
  const address = (await page.getByLabel("Inbox address").textContent())!.trim();
  expect(address).toMatch(/^p-[0-9a-f]{32}@/);

  // Unsigned mail is refused.
  const raw = [`From: Ada Files <${ada.email}>`, `To: ${address}`, "Subject: Fwd: Pier 3 minutes", "", "Ben will book the crane for Monday."].join("\r\n");
  expect((await request.post("/api/inbound-email", { data: raw, headers: { "content-type": "message/rfc822" } })).status()).toBe(401);

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "v1=" + createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const sent = Date.now();
  const response = await request.post("/api/inbound-email", {
    data: raw,
    headers: { "content-type": "message/rfc822", "x-forgeboard-timestamp": timestamp, "x-forgeboard-signature": signature, "x-forgeboard-to": address },
  });
  expect(response.status()).toBe(201);

  await openInbox(page);
  await expect(page.getByRole("list", { name: "Inbox emails" }).getByText("Fwd: Pier 3 minutes")).toBeVisible({ timeout: 60_000 });
  expect(Date.now() - sent).toBeLessThan(60_000);
});

test("an upload past the storage quota is refused with a clear message", async ({ page }) => {
  await logIn(page, ada.email, PASSWORD);
  await admin.from("workspaces").update({ storage_bytes_used: 1024 ** 3 - 1024 }).eq("id", workspaceId);
  try {
    await page.goto(`/w/${slug}/projects/${projectId}?task=${taskId}`);
    // The History list loads after the panel is interactive.
    await expect(page.getByRole("dialog", { name: "Task details" }).getByRole("list", { name: "History" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Attach files").setInputFiles({ name: "survey.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4096, 32) });
    await expect(page.getByRole("alert").filter({ hasText: "storage" })).toContainText("This file would go over your plan's 1 GB of storage");
    await expect(page.getByRole("list", { name: "Files" })).toHaveCount(0);
  } finally {
    await admin.from("workspaces").update({ storage_bytes_used: 0 }).eq("id", workspaceId);
  }
});
