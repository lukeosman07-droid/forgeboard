import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chunkDocument,
  cleanTranscript,
  findSimilarTask,
  htmlToText,
  joinPages,
  mergeExtractions,
  pageAt,
  pageOfQuote,
  placeOnPages,
  similarity,
  splitPages,
} from "@/lib/capture";
import type { Extraction } from "@/lib/ai/schema";
import { readFileText, parseEmail } from "@/lib/read-file";
import { makePdf } from "./make-pdf";

// The AI call is replaced by a stand-in "model" that reads the [Page N]
// markers' text and returns one task per ACTION line, on purpose reporting the
// wrong page, so the test proves pages come from where the quote really is.
const calls: string[] = [];
vi.mock("@/lib/ai/client", () => ({
  sumUsage: () => undefined,
  runStructured: async ({ content }: { content: string }) => {
    calls.push(content);
    const lines = content.split("\n").filter((l) => l.startsWith("ACTION:"));
    const decisions = content.split("\n").filter((l) => l.startsWith("DECISION:"));
    return {
      ok: true,
      data: {
        summary: "Minutes.",
        action_items: lines.map((l) => ({
          title: l.slice(8).split(" - ")[0],
          assignee: "Unassigned",
          due_date: null,
          priority: "medium",
          source_quote: l,
          source_page: 1,
        })),
        decisions: decisions.map((l) => ({ title: l.slice(10), details: "", source_quote: l, source_page: 1 })),
        risks: [],
        questions: [],
      },
    };
  },
}));

const { extractFromDocument } = await import("@/lib/ai/extract");

function extraction(over: Partial<Extraction> = {}): Extraction {
  return { summary: "", action_items: [], decisions: [], risks: [], questions: [], ...over };
}
const act = (title: string, over: Partial<Extraction["action_items"][number]> = {}) => ({
  title,
  assignee: "Unassigned",
  due_date: null,
  priority: "medium" as const,
  source_quote: title,
  source_page: null,
  ...over,
});

describe("htmlToText", () => {
  it("keeps the words and line breaks, drops tags, scripts and styles", () => {
    const html = `<html><head><style>p{color:red}</style></head><body><p>Pour the deck&nbsp;Friday.</p><script>alert(1)</script><ul><li>Rebar &amp; forms</li></ul>Thanks<br>Ada</body></html>`;
    expect(htmlToText(html)).toBe("Pour the deck Friday.\n• Rebar & forms\nThanks\nAda");
  });
});

describe("cleanTranscript", () => {
  it("turns WebVTT into timestamped lines with speakers", () => {
    const vtt = "WEBVTT\n\n1\n00:01:02.500 --> 00:01:05.000\n<v Ada Lovelace>We'll use epoxy grout.\n\n00:01:06.000 --> 00:01:08.000\nAgreed.";
    expect(cleanTranscript(vtt)).toBe("[00:01:02] Ada Lovelace: We'll use epoxy grout.\n[00:01:06] Agreed.");
  });
  it("turns SRT into timestamped lines", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,000\nBen: Pier 3 is late.\n\n2\n00:00:04,000 --> 00:00:06,000\nNeed a new date.";
    expect(cleanTranscript(srt)).toBe("[00:00:01] Ben: Pier 3 is late.\n[00:00:04] Need a new date.");
  });
});

describe("pages", () => {
  it("joins pages and splits them back", () => {
    const { text, offsets } = joinPages(["one", "two", "three"]);
    expect(splitPages(text, offsets)).toEqual(["one", "two", "three"]);
    expect(pageAt(offsets, text.indexOf("three"))).toBe(3);
  });

  it("finds a quote's page: exact, across a page break, by most words, or not at all", () => {
    const { text, offsets } = joinPages(["Welcome and attendance.", "Ben to order the bearings by Friday.", "Grout will be epoxy. Next meeting Tuesday."]);
    expect(pageOfQuote("Ben to order the bearings by Friday.", text, offsets)).toBe(2);
    expect(pageOfQuote("by Friday. Grout will be", text, offsets)).toBe(2);
    expect(pageOfQuote("The grout will be epoxy", text, offsets)).toBe(3);
    expect(pageOfQuote("Something nobody said at all", text, offsets)).toBeNull();
    expect(pageOfQuote("Ben to order", text, null)).toBeNull();
  });
});

describe("chunkDocument", () => {
  it("splits a paged document between pages, with page markers", () => {
    const pages = Array.from({ length: 40 }, (_, i) => `Page ${i + 1} text. `.repeat(200));
    const { text, offsets } = joinPages(pages);
    const chunks = chunkDocument(text, offsets, 24_000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].firstPage).toBe(1);
    expect(chunks.at(-1)!.lastPage).toBe(40);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].firstPage).toBe(chunks[i - 1].lastPage! + 1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(24_000 + 40);
      expect(c.text.startsWith(`[Page ${c.firstPage}]`)).toBe(true);
    }
  });

  it("splits plain text at blank lines and keeps short text whole", () => {
    expect(chunkDocument("short notes", null)).toHaveLength(1);
    const long = Array.from({ length: 50 }, (_, i) => `Paragraph ${i} `.repeat(60)).join("\n\n");
    const chunks = chunkDocument(long, null, 5000);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.text.length <= 5000 && c.firstPage === null)).toBe(true);
    expect(chunks.map((c) => c.text).join("\n\n").replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " ").trim());
  });
});

describe("duplicates", () => {
  it("scores alike titles high and different ones low", () => {
    expect(similarity("Order the bearings", "order bearings")).toBe(1);
    expect(similarity("Order the bearings", "Pour the deck")).toBe(0);
  });

  it("warns about a similar open task, not a done one", () => {
    const tasks = [
      { title: "Send pump curves to Sam", status: "open" },
      { title: "Order bearings", status: "done" },
    ];
    expect(findSimilarTask("Send the pump curves to Sam", tasks)?.title).toBe("Send pump curves to Sam");
    expect(findSimilarTask("Order the bearings", tasks)).toBeNull();
    expect(findSimilarTask("Book the crane", tasks)).toBeNull();
  });

  it("merges parts, keeping one copy with the details either had", () => {
    const merged = mergeExtractions([
      extraction({ summary: "Part one.", action_items: [act("Order the bearings", { source_page: 2 })] }),
      extraction({ summary: "Part two.", action_items: [act("Order bearings", { assignee: "Ben", due_date: "2026-12-04" }), act("Book the crane")] }),
    ]);
    expect(merged.summary).toBe("Part one. Part two.");
    expect(merged.action_items.map((a) => [a.title, a.assignee, a.due_date, a.source_page])).toEqual([
      ["Order the bearings", "Ben", "2026-12-04", 2],
      ["Book the crane", "Unassigned", null, null],
    ]);
  });

  it("pins items to the page their quote is on, not the page the AI guessed", () => {
    const { text, offsets } = joinPages(["Intro.", "Ada will check pier loads.", "Ben books the crane."]);
    const placed = placeOnPages(extraction({ action_items: [act("Check pier loads", { source_quote: "Ada will check pier loads.", source_page: 3 })] }), text, offsets);
    expect(placed.action_items[0].source_page).toBe(2);
    const pasted = placeOnPages(extraction({ action_items: [act("x", { source_page: 4 })] }), "x", null);
    expect(pasted.action_items[0].source_page).toBeNull();
  });
});

describe("reading files", () => {
  it("reads a PDF page by page", async () => {
    const pdf = makePdf([["Site meeting minutes"], ["ACTION: Order bearings - Ben"], ["DECISION: Use epoxy grout"]]);
    const read = await readFileText(pdf, "application/pdf");
    expect(read.pageCount).toBe(3);
    expect(read.scanned).toBe(false);
    expect(read.pageOffsets).toHaveLength(3);
    expect(splitPages(read.text, read.pageOffsets!)[1]).toContain("Order bearings");
  });

  it("treats a PDF with no text as a scan", async () => {
    const read = await readFileText(makePdf([[], []]), "application/pdf");
    expect(read.scanned).toBe(true);
    expect(read.text).toBe("");
  });

  it("reads email, preferring text and stripping HTML", async () => {
    const raw = [
      "From: Ada Lovelace <Ada@Example.test>",
      "To: p-0123456789abcdef0123456789abcdef@inbox.example.test",
      "Subject: Pier 3 update",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Ben will <b>book the crane</b> for Monday.</p><script>x()</script>",
    ].join("\r\n");
    const email = await parseEmail(raw);
    expect(email.from).toBe("ada@example.test");
    expect(email.subject).toBe("Pier 3 update");
    expect(email.text).toContain("Ben will book the crane for Monday.");
    expect(email.text).not.toMatch(/<\/?(p|b|script)>/);
    expect(email.text).not.toContain("x()");
  });

  it("reads transcripts and plain text", async () => {
    const vtt = await readFileText(new TextEncoder().encode("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello"), "text/vtt");
    expect(vtt.text).toBe("[00:00:01] Hello");
    const txt = await readFileText(new TextEncoder().encode("Plain notes\r\nline two"), "text/plain");
    expect(txt.text).toBe("Plain notes\nline two");
  });
});

describe("a 40-page PDF of meeting minutes", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("yields tasks that each point at the right page", async () => {
    // Every fifth page has an action item; pages are long enough to need several parts.
    const filler = Array.from({ length: 45 }, (_, i) => `Discussion line ${i} about schedules, submittals and site logistics.`);
    const pages = Array.from({ length: 40 }, (_, i) => {
      const page = i + 1;
      const lines = [`Minutes, page ${page}`, ...filler];
      if (page % 5 === 0) lines.splice(10, 0, `ACTION: Task from page ${page} - owner ${page}`);
      if (page === 23) lines.splice(5, 0, "DECISION: Use epoxy grout under the bearings");
      return lines;
    });
    const read = await readFileText(makePdf(pages), "application/pdf");
    expect(read.pageCount).toBe(40);

    const result = await extractFromDocument({ text: read.text, pageOffsets: read.pageOffsets, today: "2026-11-27" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.length).toBeGreaterThan(1); // read in parts
    expect(calls.every((c) => c.includes("<notes>") && c.includes("[Page "))).toBe(true);

    const tasks = result.data.action_items;
    expect(tasks).toHaveLength(8);
    for (const t of tasks) {
      const page = Number(/page (\d+)/.exec(t.title)![1]);
      expect(t.source_page, t.title).toBe(page);
    }
    expect(result.data.decisions).toEqual([expect.objectContaining({ source_page: 23 })]);
  });
});
