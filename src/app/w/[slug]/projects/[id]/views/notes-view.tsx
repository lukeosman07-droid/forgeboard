"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useWorkspace } from "@/components/app/workspace-context";
import { formatDate } from "@/lib/dates";
import { fileHref } from "@/lib/files";
import type { Item, ProjectDocument } from "@/lib/types";
import AiExtractPanel from "../ai-extract-panel";
import type { Usage } from "../project-workspace";

const ORIGIN: Record<ProjectDocument["origin"], string> = { paste: "Pasted notes", upload: "File", email: "Email" };

// AI capture (paste, file or inbox -> tasks, decisions, risks), and the
// documents things were captured from. ?doc=<id> opens one (a citation link).
export default function NotesView({
  projectId,
  usage,
  notes,
  items,
  onSaved,
}: {
  projectId: string;
  usage: Usage;
  notes: ProjectDocument[];
  items: Item[];
  onSaved: () => void;
}) {
  const { limits, canEdit } = useWorkspace();
  // The document a citation link points at (?doc=<id>), read after hydration.
  const focus = useSyncExternalStore(
    () => () => {},
    () => new URL(window.location.href).searchParams.get("doc"),
    () => null,
  );

  useEffect(() => {
    if (focus) requestAnimationFrame(() => document.getElementById(`doc-${focus}`)?.scrollIntoView({ block: "center" }));
  }, [focus]);

  return (
    <div className="max-w-4xl space-y-8">
      {canEdit && (
        <AiExtractPanel
          projectId={projectId}
          usage={usage}
          startOpen
          onSaved={onSaved}
          tasks={items.filter((i) => i.type === "action_item")}
          fileAi={limits.features.file_ai}
        />
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Documents</h2>
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
            No documents yet. Notes, files and emails you capture are kept here, and each item links back to its source.
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Documents">
            {notes.map((note) => {
              const count = items.filter((i) => i.source_document_id === note.id).length;
              const pages = note.page_offsets?.length;
              return (
                <li
                  key={note.id}
                  id={`doc-${note.id}`}
                  className={`rounded-xl border bg-slate-900/60 p-5 ${focus === note.id ? "border-orange-500/60 ring-2 ring-orange-500/30" : "border-white/10"}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 font-medium text-slate-300">{ORIGIN[note.origin]}</span>
                    <span>{formatDate(note.created_at.slice(0, 10))}</span>
                    {pages ? <span>· {pages} pages</span> : null}
                    {note.email_from && <span>· from {note.email_from}</span>}
                    <span>
                      · {count} item{count === 1 ? "" : "s"} captured
                    </span>
                  </div>
                  {note.title && <p className="mt-2 font-medium text-white">{note.title}</p>}
                  {note.summary && <p className="mt-1 text-slate-300">{note.summary}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {note.attachment_id && (
                      <a href={fileHref(note.attachment_id)} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-400 hover:text-orange-300">
                        Open the file
                      </a>
                    )}
                    {note.raw_text && (
                      <details open={focus === note.id} className="w-full">
                        <summary className="cursor-pointer text-sm text-orange-400 hover:text-orange-300">Show text</summary>
                        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/60 p-4 font-sans text-sm text-slate-300">
                          {note.raw_text}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
