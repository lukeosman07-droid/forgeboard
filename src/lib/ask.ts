// Ask Forgeboard, the parts that don't call the AI: numbering the passages
// the database found, and checking the answer's citations against them. The
// AI may only cite passages it was given, and those are only ever ones the
// asker can read (the search runs under their own permissions).

export type AskPassage = {
  kind: "task" | "comment" | "document";
  id: string;
  item_id: string | null;
  project_id: string;
  project_name: string;
  title: string;
  excerpt: string | null;
  item_type: string | null;
  status: string | null;
  created_at: string;
};

export type AskSource = {
  /** The number the answer cites, as [S1]. */
  n: number;
  kind: AskPassage["kind"];
  id: string;
  item_id: string | null;
  project_id: string;
  project_name: string;
  title: string;
  item_type: string | null;
};

export const NOT_FOUND = "I could not find that.";

const KIND_LABEL: Record<string, string> = { action_item: "Task", decision: "Decision", risk: "Risk", question: "Question" };

/** The passages as tagged blocks for the prompt, numbered S1, S2, … */
export function askContext(passages: AskPassage[]): string {
  return passages
    .map((p, i) => {
      const what = p.kind === "document" ? "Document" : p.kind === "comment" ? `Comment on ${KIND_LABEL[p.item_type ?? ""] ?? "task"}` : (KIND_LABEL[p.item_type ?? ""] ?? "Task");
      const meta = [`project: ${p.project_name}`, `date: ${p.created_at.slice(0, 10)}`, p.status && p.kind === "task" ? `status: ${p.status}` : ""].filter(Boolean).join(" | ");
      return `<source id="S${i + 1}">\n${what}: ${p.title}\n${meta}\n${(p.excerpt ?? "").trim()}\n</source>`;
    })
    .join("\n\n");
}

/**
 * Keeps only citations to passages that were provided, numbers them in order
 * of first use, and rewrites the markers to match. An answer that cites nothing
 * valid is treated as not found.
 */
export function resolveCitations(answer: string, passages: AskPassage[]): { answer: string; sources: AskSource[] } {
  const renumber = new Map<number, number>();
  const sources: AskSource[] = [];
  const text = answer.replace(/\[S(\d{1,3})\]/g, (_, raw: string) => {
    const index = Number(raw) - 1;
    const passage = passages[index];
    if (!passage) return "";
    if (!renumber.has(index)) {
      renumber.set(index, sources.length + 1);
      sources.push({
        n: sources.length + 1,
        kind: passage.kind,
        id: passage.id,
        item_id: passage.item_id,
        project_id: passage.project_id,
        project_name: passage.project_name,
        title: passage.title,
        item_type: passage.item_type,
      });
    }
    return `[S${renumber.get(index)}]`;
  });
  const cleaned = text.replace(/[ \t]+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  if (sources.length === 0 || !cleaned) return { answer: NOT_FOUND, sources: [] };
  return { answer: cleaned, sources };
}

/** Where a cited source opens: the task, or the project's AI Notes view. */
export function sourcePath(source: Pick<AskSource, "kind" | "item_id" | "project_id" | "id">): string {
  if (source.item_id) return `/projects/${source.project_id}?task=${source.item_id}`;
  return `/projects/${source.project_id}?view=notes&doc=${source.id}`;
}
