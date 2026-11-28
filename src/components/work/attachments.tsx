"use client";

import { useRef, useState } from "react";
import { UPLOAD_ACCEPT, fileHref, formatBytes, isImage, opensInBrowser } from "@/lib/files";
import type { Attachment } from "@/lib/types";
import { uploadFile } from "@/lib/upload";
import { deleteAttachment } from "@/server/files";
import { Icon } from "./ui";

// Files on a task or a document: drop files in (or pick them), see a preview
// of images, open PDFs in the browser, download anything else.
// Files open through /api/files/<id>, which hands out a 5-minute signed link.
export default function Attachments({
  projectId,
  itemId,
  documentId,
  rfiId,
  submittalId,
  files,
  setFiles,
  canEdit,
}: {
  projectId: string;
  itemId?: string;
  documentId?: string;
  rfiId?: string;
  submittalId?: string;
  files: Attachment[];
  setFiles: (update: (files: Attachment[]) => Attachment[]) => void;
  canEdit: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  async function add(list: FileList | File[]) {
    const chosen = [...list];
    if (chosen.length === 0) return;
    setErrors([]);
    setUploading(chosen.map((f) => f.name));
    // One at a time, so the quota check sees each file before the next.
    for (const file of chosen) {
      const result = await uploadFile(file, { projectId, itemId, documentId, rfiId, submittalId });
      if (result.attachment) setFiles((current) => [result.attachment!, ...current]);
      if (result.error) setErrors((e) => [...e, result.error!]);
      setUploading((u) => u.filter((name) => name !== file.name));
    }
  }

  async function remove(file: Attachment) {
    if (!confirm(`Delete ${file.name}? This can't be undone.`)) return;
    const result = await deleteAttachment(file.id);
    if (result.error) setErrors([result.error]);
    else setFiles((current) => current.filter((f) => f.id !== file.id));
  }

  return (
    <section
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(false);
        void add(e.dataTransfer.files);
      }}
      className={`rounded-xl transition ${over ? "bg-orange-500/10 ring-2 ring-orange-500/50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Files {files.length > 0 && <span className="text-slate-600">({files.length})</span>}
        </h3>
        {canEdit && (
          <>
            <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white">
              <Icon name="paperclip" className="h-3.5 w-3.5" />
              Attach files
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="hidden"
              aria-label="Attach files"
              onChange={(e) => {
                if (e.target.files) void add(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {errors.map((message, i) => (
        <p key={i} role="alert" className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {message}
        </p>
      ))}

      {files.length === 0 && uploading.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{canEdit ? "Drop files here: PDFs, drawings, photos, email. Up to 25 MB each." : "No files."}</p>
      ) : (
        <ul className="mt-2 space-y-1.5" aria-label="Files">
          {uploading.map((name) => (
            <li key={`up-${name}`} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-slate-400" role="status">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" aria-hidden />
              Uploading {name}…
            </li>
          ))}
          {files.map((file) => (
            <li key={file.id} className="group flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
              {isImage(file.mime_type) ? (
                // A preview through the same short-lived link. It's an <img>, so the file is never run as a page.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileHref(file.id)} alt="" className="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white/5 text-[10px] font-semibold uppercase text-slate-400">
                  {file.name.split(".").pop()?.slice(0, 4)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a href={fileHref(file.id)} target="_blank" rel="noopener noreferrer" className="block truncate text-slate-200 hover:text-orange-300">
                  {file.name}
                </a>
                <span className="text-xs text-slate-500">
                  {formatBytes(file.size_bytes)} · {opensInBrowser(file.mime_type) ? "opens in the browser" : "downloads"}
                </span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(file)}
                  aria-label={`Delete ${file.name}`}
                  className="rounded p-1 text-slate-500 opacity-0 hover:bg-red-500/10 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
