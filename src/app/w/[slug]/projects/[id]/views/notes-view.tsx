"use client";

import { formatDate } from "@/lib/dates";
import type { Item, Note } from "@/lib/types";
import AiExtractPanel from "../ai-extract-panel";
import type { Usage } from "../project-workspace";

// Paste meeting notes -> AI creates tasks, decisions, risks. Plus the history of saved notes.
export default function NotesView({
  projectId,
  usage,
  notes,
  items,
  onSaved,
}: {
  projectId: string;
  usage: Usage;
  notes: Note[];
  items: Item[];
  onSaved: () => void;
}) {
  return (
    <div className="max-w-4xl space-y-8">
      <AiExtractPanel projectId={projectId} usage={usage} startOpen onSaved={onSaved} />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Saved notes</h2>
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
            No notes yet. When you save an AI extraction, the original text is kept here for reference.
          </div>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => {
              const count = items.filter((i) => i.note_id === note.id).length;
              return (
                <li key={note.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
                  <p className="text-xs text-slate-500">
                    {formatDate(note.created_at.slice(0, 10))} · {count} item{count === 1 ? "" : "s"} extracted
                  </p>
                  {note.summary && <p className="mt-2 text-slate-200">{note.summary}</p>}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-orange-400 hover:text-orange-300">Show original text</summary>
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/60 p-4 font-sans text-sm text-slate-300">
                      {note.raw_text}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
