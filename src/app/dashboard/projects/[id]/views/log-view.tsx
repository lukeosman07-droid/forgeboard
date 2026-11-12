"use client";

import { useState } from "react";
import { createItem } from "@/app/dashboard/actions";
import { useToday } from "@/lib/dates";
import type { Item, ItemType } from "@/lib/types";
import ItemForm from "../item-form";
import ItemRow from "../item-row";

// Decision log plus risks and open questions (things that aren't tasks).

type Tab = "decisions" | "risks";

const TABS: { id: Tab; label: string; types: ItemType[]; empty: string }[] = [
  {
    id: "decisions",
    label: "Decisions",
    types: ["decision"],
    empty: "No decisions logged yet. Record what the team agreed on so nobody has to dig through old emails.",
  },
  {
    id: "risks",
    label: "Risks & Questions",
    types: ["risk", "question"],
    empty: "No risks or open questions yet. Track what could go wrong before it does.",
  },
];

export default function LogView({ projectId, items }: { projectId: string; items: Item[] }) {
  const today = useToday();
  const [tab, setTab] = useState<Tab>("decisions");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const current = TABS.find((t) => t.id === tab)!;

  const visible = items
    .filter((i) => current.types.includes(i.type))
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || b.created_at.localeCompare(a.created_at));

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-white/10 p-1" role="group" aria-label="Log type">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setAdding(false);
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium ${tab === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-slate-500">{items.filter((i) => t.types.includes(i.type)).length}</span>
            </button>
          ))}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/5"
          >
            + Add {tab === "decisions" ? "decision" : "risk or question"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {adding && (
        <div className="mb-4">
          <ItemForm
            types={current.types}
            submitLabel="Add"
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              const result = await createItem(projectId, input);
              if (!result.error) setAdding(false);
              return result;
            }}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">{current.empty}</div>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <ItemRow key={item.id} item={item} today={today} editTypes={current.types} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}
