import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_PASSWORD_LENGTH, isDemoAccount, passwordProblem, siteUrl } from "@/lib/account";
import { checkoutPath, safeNext } from "@/lib/safe-next";

afterEach(() => vi.unstubAllEnvs());

describe("passwordProblem", () => {
  it("accepts a password of the minimum length", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects short and very long passwords", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(passwordProblem("a".repeat(73))).toMatch(/at most/);
  });

  it("requires the confirmation to match when one is given", () => {
    expect(passwordProblem("correct-horse-1", "correct-horse-1")).toBeNull();
    expect(passwordProblem("correct-horse-1", "correct-horse-2")).toMatch(/don't match/);
  });
});

describe("isDemoAccount", () => {
  it("matches the default demo email, ignoring case", () => {
    expect(isDemoAccount("demo@demo.com")).toBe(true);
    expect(isDemoAccount("Demo@Demo.com")).toBe(true);
    expect(isDemoAccount("someone@example.com")).toBe(false);
    expect(isDemoAccount(null)).toBe(false);
  });

  it("follows DEMO_EMAIL when it is set", () => {
    vi.stubEnv("DEMO_EMAIL", "tour@forgeboard.test");
    expect(isDemoAccount("tour@forgeboard.test")).toBe(true);
    expect(isDemoAccount("demo@demo.com")).toBe(false);
  });
});

describe("siteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com/");
    expect(siteUrl()).toBe("https://app.example.com");
  });
});

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext(checkoutPath("team"))).toBe("/api/checkout?plan=team&interval=month");
    expect(checkoutPath("starter", "year", "acme")).toBe("/api/checkout?plan=starter&interval=year&workspace=acme");
  });

  it("blocks anything that could leave the site", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("dashboard")).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(42)).toBeNull();
  });
});
