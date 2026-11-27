// A small, safe Markdown subset for comments: paragraphs, line breaks, "- "
// and "1. " lists, **bold**, *italic*, `code`, [links](https://...), bare
// https:// links and @mentions. It builds a tree that React renders as
// elements, so no HTML from a comment ever reaches the page.

import { MENTION_RE } from "./mentions";

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "mention"; id: string; name: string };

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

/** Only web and mail links; anything else (javascript:, data:) stays text. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const TOKEN = new RegExp(
  [
    MENTION_RE.source, // 1 name, 2 id
    "`([^`\\n]+)`", // 3 code
    "\\*\\*([^*\\n]+?)\\*\\*", // 4 bold
    "(?<![\\w*])\\*([^*\\n]+?)\\*(?![\\w*])", // 5 italic
    "(?<![\\w_])_([^_\\n]+?)_(?![\\w_])", // 6 italic
    "\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)", // 7 text, 8 href
    "(https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?'\"])", // 9 bare link
  ].join("|"),
  "g",
);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev?.kind === "text") prev.text += t;
    else out.push({ kind: "text", text: t });
  };
  for (const m of text.matchAll(TOKEN)) {
    push(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2]) out.push({ kind: "mention", name: m[1], id: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "code", text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: "bold", children: parseInline(m[4]) });
    else if (m[5] !== undefined || m[6] !== undefined) out.push({ kind: "italic", children: parseInline(m[5] ?? m[6]) });
    else if (m[7] !== undefined) {
      const href = safeHref(m[8]);
      if (href) out.push({ kind: "link", href, children: parseInline(m[7]) });
      else push(m[0]);
    } else if (m[9]) {
      const href = safeHref(m[9]);
      if (href) out.push({ kind: "link", href, children: [{ kind: "text", text: m[9] }] });
      else push(m[0]);
    }
  }
  push(text.slice(last));
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    const flushParagraph = () => {
      if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph.map(parseInline) });
      paragraph = [];
    };
    const flushList = () => {
      if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    };
    for (const line of lines) {
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
      const numbered = line.match(/^\s*\d{1,3}[.)]\s+(.*)$/);
      const item = bullet ?? numbered;
      if (item) {
        flushParagraph();
        const ordered = !!numbered && !bullet;
        if (list && list.ordered !== ordered) flushList();
        list ??= { ordered, items: [] };
        list.items.push(item[1]);
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
  }
  return blocks;
}

/** Plain text for emails and previews: mentions become @Name, Markdown marks go. */
export function toPlainText(source: string): string {
  return source
    .replace(MENTION_RE, (_all, name: string) => `@${name}`)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .trim();
}
