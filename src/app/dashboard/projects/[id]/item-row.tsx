"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deleteItem, setItemStatus, updateItem } from "@/app/dashboard/actions";
import { formatDate } from "@/lib/dates";
import type { Item, ItemType } from "@/lib/types";
import ItemForm from "./item-form";

const PRIORITY_STYLES = {
  high: "border-red-500/30 bg-red-500/10 text-red-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  low: "border-slate-500/30 bg-slate-500/10 text-slate-300",
} as const;

export default function ItemRow({
  item,
  today,
  editTypes,
  onError,
}: {
  item: Item;
  today: string | null;
  editTypes: ItemType[];
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setOptimisticStatus] = useOptimistic(item.status);

  const done = status === "done";
  const canComplete = item.type !== "decision";
  const overdue = item.type === "action_item" && !done && !!item.due_date && !!today && item.due_date < today;

  if (editing) {
    return (
      <li>
        <ItemForm
          types={editTypes}
          initial={item}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const result = await updateItem(item.id, input);
            if (!result.error) setEditing(false);
            return result;
          }}
        />
      </li>
    );
  }

  const toggle = () =>
    startTransition(async () => {
      const next = done ? "open" : "done";
      setOptimisticStatus(next);
      const result = await setItemStatus(item.id, next);
      if (result.error) onError(result.error);
    });

  const remove = () => {
    if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (result.error) onError(result.error);
    });
  };

  const completeLabel = item.type === "action_item" ? "done" : item.type === "risk" ? "resolved" : "answered";

  return (
    <li
      className={`group flex gap-3 rounded-xl border p-4 transition ${
        overdue ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-slate-900/60"
      } ${pending ? "opacity-60" : ""}`}
    >
      {canComplete && (
        <input
          type="checkbox"
          checked={done}
          onChange={toggle}
          aria-label={`Mark "${item.title}" as ${completeLabel}`}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-orange-500"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? "text-slate-500 line-through" : "text-slate-100"}`}>{item.title}</p>
        {item.details && <p className="mt-1 whitespace-pre-line text-sm text-slate-400">{item.details}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {item.type !== "decision" && item.type !== "risk" && (
            <span className={item.assignee ? "text-slate-300" : "text-slate-500"}>
              {item.type === "question" ? "Ask: " : "👤 "}
              {item.assignee || "Unassigned"}
            </span>
          )}
          {item.due_date && (
            <span className={overdue ? "font-semibold text-red-300" : "text-slate-400"}>
              {overdue ? "Overdue · " : "Due "}
              {formatDate(item.due_date)}
            </span>
          )}
          {item.priority && (
            <span className={`rounded-full border px-2 py-0.5 capitalize ${PRIORITY_STYLES[item.priority]}`}>
              {item.priority}
              {item.type === "risk" ? " severity" : ""}
            </span>
          )}
          {done && item.type !== "action_item" && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 capitalize text-emerald-300">{completeLabel}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
