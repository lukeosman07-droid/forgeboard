// @mentions in comments. Stored as @[Name](user-id) so a rename never breaks
// one and the database can tell who was mentioned. While typing, people see
// and edit "@Name"; these helpers convert between the two forms.

export type Mention = { id: string; name: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Same pattern as public.comment_mentions() in the database. */
export const MENTION_RE = new RegExp(`@\\[([^\\]]{0,200})\\]\\((${UUID})\\)`, "g");

/** The distinct user IDs mentioned in a stored comment. */
export function mentionedIds(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]))];
}

/** Names can't contain the characters that would break the stored form. */
function safeName(name: string) {
  return name.replace(/[[\]()]/g, "").trim() || "someone";
}

/**
 * Turns what someone typed into the stored form. Every "@Name" for a person
 * picked from the list becomes @[Name](id). Longer names go first, so "@Ann Lee"
 * isn't taken as "@Ann".
 */
export function toStored(text: string, picked: Mention[]): string {
  const byLength = [...new Map(picked.map((m) => [m.id, m])).values()].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const m of byLength) {
    const name = safeName(m.name);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Not already inside a stored mention, and followed by a word boundary.
    out = out.replace(new RegExp(`(^|[^\\[\\w])@${escaped}(?![\\w])`, "g"), (_all, lead: string) => `${lead}@[${name}](${m.id})`);
  }
  return out;
}

/** The stored form back into editable text plus the people it mentions. */
export function toEditable(body: string): { text: string; mentions: Mention[] } {
  const mentions: Mention[] = [];
  const text = body.replace(MENTION_RE, (_all, name: string, id: string) => {
    if (!mentions.some((m) => m.id === id)) mentions.push({ id, name });
    return `@${name}`;
  });
  return { text, mentions };
}

/** The partial "@na" being typed just before the cursor, if any. */
export function mentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(^|\s)@([\p{L}\p{N}._'-]{0,40})$/u);
  if (!match) return null;
  return { start: cursor - match[2].length - 1, query: match[2] };
}
