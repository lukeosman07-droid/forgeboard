"use client";

import { useState, useTransition } from "react";
import type { ItemInput } from "@/app/dashboard/actions";
import type { Item, ItemType } from "@/lib/types";

const inputClass =
  "mt-1 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

// Add/edit form for one item. Which fields show depends on the item type.
export default function ItemForm({
  types,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  types: ItemType[];
  initial?: Partial<Item>;
  submitLabel: string;
  onSubmit: (input: ItemInput) => Promise<{ error?: string }>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ItemType>(initial?.type ?? types[0]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const showAssignee = type === "action_item" || type === "question";
  const showDue = type === "action_item";
  const showPriority = type === "action_item" || type === "risk";

  function handleSubmit(formData: FormData) {
    const get = (name: string) => String(formData.get(name) ?? "");
    const input: ItemInput = {
      type,
      title: get("title"),
      details: get("details"),
      assignee: showAssignee ? get("assignee") : null,
      due_date: showDue ? get("due_date") : null,
      priority: showPriority ? (get("priority") as ItemInput["priority"]) : null,
    };
    startTransition(async () => {
      const result = await onSubmit(input);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form
      // onSubmit (not action=) so the fields keep what was typed if saving fails.
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-3 rounded-xl border border-white/10 bg-slate-900 p-4"
    >
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {types.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label="Item type">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                type === t ? "bg-orange-500 text-slate-950" : "border border-white/15 text-slate-300 hover:bg-white/5"
              }`}
            >
              {t === "risk" ? "Risk" : "Question"}
            </button>
          ))}
        </div>
      )}
      <label className="block">
        <span className="text-xs font-medium text-slate-300">{type === "question" ? "Question" : "Title"}</span>
        <input name="title" required maxLength={500} defaultValue={initial?.title} autoFocus className={inputClass} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-300">Details <span className="text-slate-500">(optional)</span></span>
        <textarea name="details" rows={2} maxLength={5000} defaultValue={initial?.details ?? ""} className={inputClass} />
      </label>
      {(showAssignee || showDue || showPriority) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {showAssignee && (
            <label className="block">
              <span className="text-xs font-medium text-slate-300">{type === "question" ? "Who should answer" : "Assignee"}</span>
              <input name="assignee" maxLength={200} defaultValue={initial?.assignee ?? ""} placeholder="Unassigned" className={inputClass} />
            </label>
          )}
          {showDue && (
            <label className="block">
              <span className="text-xs font-medium text-slate-300">Due date</span>
              <input name="due_date" type="date" defaultValue={initial?.due_date ?? ""} className={`${inputClass} [color-scheme:dark]`} />
            </label>
          )}
          {showPriority && (
            <label className="block">
              <span className="text-xs font-medium text-slate-300">{type === "risk" ? "Severity" : "Priority"}</span>
              <select name="priority" defaultValue={initial?.priority ?? "medium"} className={inputClass}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-70"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
