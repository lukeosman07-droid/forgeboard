"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createProject, type ActionResult } from "./actions";

// "New project" button that opens a small dialog with name + description.
export default function NewProjectButton({ variant = "primary" }: { variant?: "primary" | "large" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState<ActionResult, FormData>(createProject, {});
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.error) dialogRef.current?.showModal();
  }, [state]);

  const open = () => {
    setFormKey((k) => k + 1);
    dialogRef.current?.showModal();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          variant === "large"
            ? "rounded-lg bg-orange-500 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-400"
            : "rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
        }
      >
        + New project
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
      >
        <form key={formKey} action={action} className="space-y-5 p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">New project</h2>
            <p className="mt-1 text-sm text-slate-400">You can paste meeting notes into it right after.</p>
          </div>
          {state.error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-200">Project name</span>
            <input
              name="name"
              required
              maxLength={200}
              autoFocus
              placeholder="e.g. Pump Station Retrofit"
              className="mt-1.5 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-200">
              Description <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              placeholder="What is this project about?"
              className="mt-1.5 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
            >
              Cancel
            </button>
            <CreateButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-70"
    >
      {pending ? "Creating…" : "Create project"}
    </button>
  );
}
