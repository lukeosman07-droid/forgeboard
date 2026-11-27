import { describe, expect, it } from "vitest";
import { NOT_FOUND, askContext, resolveCitations, sourcePath, type AskPassage } from "@/lib/ask";
import { weekOf } from "@/lib/ai/project-data";
import { MAX_UPLOAD_BYTES, canCapture, fileHref, formatBytes, opensInBrowser, uploadProblem, uploadTypeFor } from "@/lib/files";
import { inboxAddress, inboxTokenFrom, signInbound, verifyInbound } from "@/lib/inbound";

describe("upload rules", () => {
  it("allows the listed types, by extension", () => {
    expect(uploadTypeFor("Minutes.PDF")).toBe("application/pdf");
    expect(uploadTypeFor("plan.dwg")).toBe("image/vnd.dwg");
    expect(uploadTypeFor("call.vtt")).toBe("text/vtt");
    expect(uploadTypeFor("photo.jpeg")).toBe("image/jpeg");
  });

  it("refuses HTML, SVG, scripts and files with no extension", () => {
    for (const name of ["page.html", "logo.svg", "run.exe", "script.js", "README"]) expect(uploadTypeFor(name)).toBeNull();
    expect(uploadProblem({ name: "logo.svg", size: 10 })).toMatch(/isn't supported/);
  });

  it("refuses files over 25 MB and empty files", () => {
    expect(uploadProblem({ name: "a.pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(uploadProblem({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/up to 25 MB/);
    expect(uploadProblem({ name: "a.pdf", size: 0 })).toMatch(/empty/);
  });

  it("opens only images and PDFs in the browser", () => {
    expect(opensInBrowser("application/pdf")).toBe(true);
    expect(opensInBrowser("image/png")).toBe(true);
    expect(opensInBrowser("text/plain")).toBe(false);
    expect(opensInBrowser("image/vnd.dwg")).toBe(false);
  });

  it("knows which files the AI can read", () => {
    expect(canCapture("minutes.pdf")).toBe(true);
    expect(canCapture("thread.eml")).toBe(true);
    expect(canCapture("photo.png")).toBe(false);
  });

  it("links files at a page and formats sizes", () => {
    expect(fileHref("abc", 12)).toBe("/api/files/abc?page=12");
    expect(fileHref("abc")).toBe("/api/files/abc");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("inbound email signature", () => {
  const secret = "test-secret";
  const body = "From: a@b.test\r\n\r\nHello";
  const now = 1_800_000_000;

  it("accepts a fresh, correct signature", () => {
    const ts = String(now);
    expect(verifyInbound(secret, signInbound(secret, ts, body), ts, body, now)).toBe(true);
    expect(verifyInbound(secret, signInbound(secret, ts, body), ts, new TextEncoder().encode(body), now + 299)).toBe(true);
  });

  it("refuses a changed body, a wrong secret, an old timestamp or a missing header", () => {
    const ts = String(now);
    const sig = signInbound(secret, ts, body);
    expect(verifyInbound(secret, sig, ts, body + "!", now)).toBe(false);
    expect(verifyInbound("other", sig, ts, body, now)).toBe(false);
    expect(verifyInbound(secret, sig, ts, body, now + 301)).toBe(false);
    expect(verifyInbound(secret, null, ts, body, now)).toBe(false);
    expect(verifyInbound(secret, sig, null, body, now)).toBe(false);
    expect(verifyInbound("", sig, ts, body, now)).toBe(false);
  });

  it("finds the project inbox token among addresses", () => {
    const token = "0123456789abcdef0123456789abcdef";
    expect(inboxTokenFrom([null, "To: Team <team@x.test>, Bridge <p-0123456789ABCDEF0123456789abcdef@inbox.x.test>"])).toBe(token);
    expect(inboxTokenFrom(["notp-0123456789abcdef0123456789abcdef@inbox.x.test"])).toBeNull();
    expect(inboxTokenFrom(["p-1234@inbox.x.test"])).toBeNull();
    expect(inboxAddress(token, "Inbox.X.test")).toBe(`p-${token}@inbox.x.test`);
    expect(inboxAddress(token, "")).toBeNull();
  });
});

describe("Ask Forgeboard citations", () => {
  const passage = (id: string, over: Partial<AskPassage> = {}): AskPassage => ({
    kind: "task",
    id,
    item_id: id,
    project_id: "p1",
    project_name: "Bridge",
    title: `Item ${id}`,
    excerpt: "text",
    item_type: "decision",
    status: "open",
    created_at: "2026-11-20T10:00:00Z",
    ...over,
  });
  const passages = [passage("a"), passage("b"), passage("c", { kind: "document", item_id: null, title: "Minutes" })];

  it("numbers sources as tagged blocks", () => {
    const ctx = askContext(passages);
    expect(ctx).toContain('<source id="S1">\nDecision: Item a');
    expect(ctx).toContain('<source id="S3">\nDocument: Minutes');
  });

  it("keeps only real citations and renumbers them in order of use", () => {
    const out = resolveCitations("We chose epoxy [S3]. Ben orders it [S1] [S9].", passages);
    expect(out.answer).toBe("We chose epoxy [S1]. Ben orders it [S2].");
    expect(out.sources.map((s) => [s.n, s.id])).toEqual([
      [1, "c"],
      [2, "a"],
    ]);
  });

  it("treats an answer with no valid citation as not found", () => {
    expect(resolveCitations("Probably epoxy.", passages)).toEqual({ answer: NOT_FOUND, sources: [] });
    expect(resolveCitations("Epoxy [S7].", passages)).toEqual({ answer: NOT_FOUND, sources: [] });
  });

  it("links tasks to the task and documents to the notes view", () => {
    expect(sourcePath({ kind: "task", item_id: "a", project_id: "p1", id: "a" })).toBe("/projects/p1?task=a");
    expect(sourcePath({ kind: "document", item_id: null, project_id: "p1", id: "c" })).toBe("/projects/p1?view=notes&doc=c");
  });
});

describe("weekOf", () => {
  it("is the Monday of the week, in UTC", () => {
    expect(weekOf(new Date("2026-11-30T13:00:00Z"))).toBe("2026-11-30"); // Monday
    expect(weekOf(new Date("2026-12-06T23:00:00Z"))).toBe("2026-11-30"); // Sunday
    expect(weekOf(new Date("2026-12-01T00:00:00Z"))).toBe("2026-11-30"); // Tuesday
  });
});
