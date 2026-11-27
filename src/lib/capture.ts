// The pieces of AI capture that don't need the AI: cleaning text, splitting a
// long document into chunks the model reads one at a time, finding the page a
// quote is on, merging what each chunk found, and spotting tasks that already
// exist. No server imports, so the review screen and the tests use them too.

import type { Extraction } from "./ai/schema";

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** HTML email -> plain text. Scripts and styles are dropped; nothing is ever rendered. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      const lower = code.toLowerCase();
      if (lower in ENTITIES) return ENTITIES[lower];
      if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16) || 32);
      if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10) || 32);
      return whole;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TIMESTAMP = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}/;

/**
 * A WebVTT or SRT transcript -> "[00:12:03] Speaker: words" lines.
 * Cue numbers, settings and markup go; consecutive cues from one speaker stay apart
 * so quotes still match.
 */
export function cleanTranscript(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
  const out: string[] = [];
  let stamp = "";
  let cue: string[] = [];
  const flush = () => {
    const text = cue.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) out.push(stamp ? `[${stamp}] ${text}` : text);
    cue = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^WEBVTT/.test(trimmed) || /^(NOTE|STYLE|REGION)\b/.test(trimmed)) continue;
    if (TIMESTAMP.test(trimmed) && trimmed.includes("-->")) {
      flush();
      const start = trimmed.split("-->")[0].trim();
      stamp = start.replace(/[.,]\d{3}$/, "").replace(/^(\d:)/, "0$1");
      if (/^\d{2}:\d{2}$/.test(stamp)) stamp = `00:${stamp}`;
      continue;
    }
    if (/^\d+$/.test(trimmed) && cue.length === 0) continue; // SRT cue number
    // WebVTT voice tags: <v Ada Lovelace>words
    cue.push(trimmed.replace(/^<v(?:\.[^ >]*)?\s+([^>]+)>/, "$1: "));
  }
  flush();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Pages and chunks
// ---------------------------------------------------------------------------

/** Joins per-page text, returning the text and where each page starts. */
export function joinPages(pages: string[]): { text: string; offsets: number[] } {
  const offsets: number[] = [];
  let text = "";
  pages.forEach((page, i) => {
    if (i > 0) text += "\n\n";
    offsets.push(text.length);
    text += page.replace(/[ \t]+\n/g, "\n").trim();
  });
  return { text, offsets };
}

/** The text of each page, from the stored offsets. */
export function splitPages(text: string, offsets: number[]): string[] {
  return offsets.map((start, i) => text.slice(start, i + 1 < offsets.length ? offsets[i + 1] : text.length).trim());
}

/** The page (1-based) that a character offset falls on. */
export function pageAt(offsets: number[], index: number): number {
  let page = 1;
  for (let i = 0; i < offsets.length; i++) if (offsets[i] <= index) page = i + 1;
  return page;
}

export type Chunk = {
  /** What the model reads. Paged documents carry "[Page N]" markers. */
  text: string;
  firstPage: number | null;
  lastPage: number | null;
};

/** About 6,000 words: big enough for context, small enough to read closely. */
export const CHUNK_CHARS = 24_000;

/**
 * Splits a document for extraction. A paged document (PDF) splits between
 * pages; anything else splits at headings or blank lines. A single page or
 * paragraph longer than the limit is cut at the limit.
 */
export function chunkDocument(text: string, offsets: number[] | null, max = CHUNK_CHARS): Chunk[] {
  if (offsets && offsets.length > 0) {
    const pages = splitPages(text, offsets);
    const chunks: Chunk[] = [];
    let current: string[] = [];
    let first = 1;
    let size = 0;
    pages.forEach((page, i) => {
      const block = `[Page ${i + 1}]\n${page}`;
      if (current.length > 0 && size + block.length > max) {
        chunks.push({ text: current.join("\n\n"), firstPage: first, lastPage: i });
        current = [];
        size = 0;
        first = i + 1;
      }
      current.push(block.length > max ? block.slice(0, max) : block);
      size += block.length + 2;
    });
    if (current.length > 0) chunks.push({ text: current.join("\n\n"), firstPage: first, lastPage: pages.length });
    return chunks;
  }

  if (text.length <= max) return [{ text, firstPage: null, lastPage: null }];
  // Prefer breaking before a heading-like line, then at a blank line.
  const parts = text.split(/\n(?=(?:#{1,6} |[A-Z0-9][^\n]{0,80}\n[=-]{3,}|\d+(?:\.\d+)*\s+[A-Z][^\n]{0,80}\n))|\n{2,}/);
  const chunks: Chunk[] = [];
  let current = "";
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if (current && current.length + piece.length + 2 > max) {
      chunks.push({ text: current, firstPage: null, lastPage: null });
      current = "";
    }
    if (piece.length > max) {
      for (let i = 0; i < piece.length; i += max) chunks.push({ text: piece.slice(i, i + max), firstPage: null, lastPage: null });
      continue;
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push({ text: current, firstPage: null, lastPage: null });
  return chunks;
}

// ---------------------------------------------------------------------------
// Matching text
// ---------------------------------------------------------------------------

/** Lowercase letters and digits only, single-spaced: how quotes and titles are compared. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(
  "a an and are as at be by for from has have in is it of on or our the their this to was we will with".split(" "),
);

function words(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * The page a quote comes from. Looks for the quote word for word first, then
 * for the page that shares the most of its words. Returns null when no page
 * contains enough of it to be sure, so a wrong page is never shown.
 */
export function pageOfQuote(quote: string, text: string, offsets: number[] | null): number | null {
  if (!offsets || offsets.length === 0 || !quote.trim()) return null;
  const pages = splitPages(text, offsets).map(normalizeText);
  const wanted = normalizeText(quote);
  if (!wanted) return null;

  const exact = pages.findIndex((p) => p.includes(wanted));
  if (exact >= 0) return exact + 1;
  // A quote that runs over a page break.
  for (let i = 0; i + 1 < pages.length; i++) if (`${pages[i]} ${pages[i + 1]}`.includes(wanted)) return i + 1;

  const quoteWords = [...new Set(words(quote))];
  if (quoteWords.length === 0) return null;
  let best = -1;
  let bestScore = 0;
  pages.forEach((p, i) => {
    const pageWords = new Set(p.split(" "));
    const score = quoteWords.filter((w) => pageWords.has(w)).length / quoteWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= 0.7 ? best + 1 : null;
}

/** How alike two titles are, 0 to 1 (shared words over all words). */
export function similarity(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return normalizeText(a) === normalizeText(b) && normalizeText(a) !== "" ? 1 : 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

/** Titles this alike are the same thing found twice. */
export const DUPLICATE_THRESHOLD = 0.75;
/** Titles this alike are worth a "similar to existing task" warning. */
export const SIMILAR_THRESHOLD = 0.5;

/** The open task most like this title, if any is alike enough to warn about. */
export function findSimilarTask<T extends { title: string; status: string }>(title: string, tasks: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const task of tasks) {
    if (task.status === "done") continue;
    const score = similarity(title, task.title);
    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }
  return bestScore >= SIMILAR_THRESHOLD ? best : null;
}

// ---------------------------------------------------------------------------
// The merge pass
// ---------------------------------------------------------------------------

function dedupe<T>(rows: T[], key: (row: T) => string, merge: (kept: T, dropped: T) => T): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    const i = kept.findIndex((k) => similarity(key(k), key(row)) >= DUPLICATE_THRESHOLD);
    if (i >= 0) kept[i] = merge(kept[i], row);
    else kept.push(row);
  }
  return kept;
}

const pick = <T>(a: T | null | undefined, b: T | null | undefined) => (a === null || a === undefined || a === "" || a === "Unassigned" ? b ?? a : a);

/**
 * Combines what each chunk found into one result. The same item found in two
 * chunks (a topic carried over a page break, or repeated in a summary) is kept
 * once, taking whichever copy has the owner, date or details the other lacks.
 */
export function mergeExtractions(parts: Extraction[]): Extraction {
  if (parts.length === 1) return parts[0];
  return {
    summary: parts
      .map((p) => p.summary.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 1500),
    action_items: dedupe(parts.flatMap((p) => p.action_items), (a) => a.title, (a, b) => ({
      ...a,
      assignee: pick(a.assignee, b.assignee) ?? "Unassigned",
      due_date: pick(a.due_date, b.due_date) ?? null,
      source_page: a.source_page ?? b.source_page,
    })),
    decisions: dedupe(parts.flatMap((p) => p.decisions), (d) => d.title, (a, b) => ({ ...a, details: a.details || b.details, source_page: a.source_page ?? b.source_page })),
    risks: dedupe(parts.flatMap((p) => p.risks), (r) => r.title, (a, b) => ({ ...a, details: a.details || b.details, source_page: a.source_page ?? b.source_page })),
    questions: dedupe(parts.flatMap((p) => p.questions), (q) => q.question, (a, b) => ({ ...a, source_page: a.source_page ?? b.source_page })),
  };
}

/**
 * Sets each item's page from where its quote really is in the document (the
 * model's page number is only a fallback), and clears pages a non-paged
 * document can't have.
 */
export function placeOnPages(extraction: Extraction, text: string, offsets: number[] | null): Extraction {
  const place = <T extends { source_quote: string; source_page: number | null }>(item: T): T => {
    if (!offsets) return { ...item, source_page: null };
    const page = pageOfQuote(item.source_quote, text, offsets);
    const fallback = item.source_page && item.source_page >= 1 && item.source_page <= offsets.length ? item.source_page : null;
    return { ...item, source_page: page ?? fallback };
  };
  return {
    summary: extraction.summary,
    action_items: extraction.action_items.map(place),
    decisions: extraction.decisions.map(place),
    risks: extraction.risks.map(place),
    questions: extraction.questions.map(place),
  };
}
