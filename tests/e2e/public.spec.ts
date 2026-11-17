import { expect, test } from "@playwright/test";

// Pages anyone can see without an account.

test("the landing page loads and no longer mentions the class project", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/ENGR 310/i)).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:sales@example.com"]')).toHaveCount(0);
});

for (const [path, heading] of [
  ["/terms", "Terms of Service"],
  ["/privacy", "Privacy Policy"],
  ["/security", "Security"],
] as const) {
  test(`${path} shows the draft notice`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText("DRAFT: needs legal review")).toBeVisible();
  });
}

test("/contact lists sales, support and security", async ({ page }) => {
  await page.goto("/contact");
  for (const name of ["Sales", "Support", "Security"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
});

test("the footer links to the legal pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("an unknown address shows the custom 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});

test("every page is served with the security headers", async ({ request }) => {
  for (const path of ["/", "/login", "/terms"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  }
});

test("the pages load without breaking the content security policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  for (const path of ["/", "/login", "/signup", "/forgot-password", "/pricing"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});

test("signed-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("the login page links to password reset", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
});

test("a wrong password shows a clear message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
});

test("sign-up enforces the minimum password length", async ({ page }) => {
  await page.goto("/signup");
  // :visible skips the hidden copy React leaves behind while the page streams in.
  await expect(page.locator('input[name="password"]:visible')).toHaveAttribute("minlength", "10");
});
