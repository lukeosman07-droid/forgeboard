"use client";

import { useId, useMemo, useRef, useState } from "react";
import { usePeople } from "@/components/app/workspace-context";
import { mentionQuery, type Mention } from "@/lib/mentions";
import { displayName } from "@/lib/people";
import { Avatar } from "./ui";

// A textarea that suggests people when you type "@". Picking someone inserts
// "@Name" and remembers who it was, so the parent can store the mention with
// toStored(text, mentions).

export type MentionDraft = { text: string; mentions: Mention[] };

export default function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  rows = 2,
  autoFocus,
}: {
  value: MentionDraft;
  onChange: (draft: MentionDraft) => void;
  /** Ctrl/⌘ + Enter. */
  onSubmit: () => void;
  placeholder?: string;
  label: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const { people } = usePeople();
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.query.toLowerCase();
    return people
      .filter((p) => {
        const name = displayName(p).toLowerCase();
        return !q || name.split(/\s+/).some((part) => part.startsWith(q)) || name.startsWith(q) || p.email?.toLowerCase().startsWith(q);
      })
      .slice(0, 6);
  }, [people, query]);

  const open = !!query && matches.length > 0;

  const track = (text: string, cursor: number) => {
    const next = mentionQuery(text, cursor);
    setQuery(next);
    if (next?.query !== query?.query) setActive(0);
  };

  const pick = (index: number) => {
    const person = matches[index];
    const el = ref.current;
    if (!person || !query || !el) return;
    const name = displayName(person).replace(/[[\]()]/g, "");
    const end = el.selectionStart ?? query.start + query.query.length + 1;
    const text = `${value.text.slice(0, query.start)}@${name} ${value.text.slice(end)}`;
    const mentions = value.mentions.some((m) => m.id === person.user_id) ? value.mentions : [...value.mentions, { id: person.user_id, name }];
    onChange({ text, mentions });
    setQuery(null);
    const cursor = query.start + name.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value.text}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange({ ...value, text: e.target.value });
          track(e.target.value, e.target.selectionStart);
        }}
        onSelect={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(active);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        maxLength={4000}
        rows={rows}
        className="field-sizing-content block max-h-80 min-h-12 w-full resize-none bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People to mention"
          className="absolute left-2 top-full z-10 mt-1 w-64 overflow-hidden rounded-lg border border-white/10 bg-slate-800 py-1 shadow-xl"
        >
          {matches.map((p, i) => (
            <li key={p.user_id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-white/10 text-white" : "text-slate-300"}`}
              >
                <Avatar name={displayName(p)} />
                <span className="truncate">{displayName(p)}</span>
                {p.role === "guest" && <span className="ml-auto text-[10px] uppercase text-slate-500">Guest</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
