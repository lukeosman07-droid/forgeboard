"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/lib/dates";
import type { ItemStatus, Priority } from "@/lib/types";
import { PRIORITIES, PRIORITY_BY_ID, STATUSES, STATUS_BY_ID, avatarColor, initials, relativeDue } from "@/lib/work";

// Small building blocks shared by the table, board, calendar and task panel.

export function Avatar({ name, size = "sm" }: { name: string | null; size?: "sm" | "md" }) {
  const dims = size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";
  if (!name) {
    return (
      <span
        title="Unassigned"
        className={`${dims} grid shrink-0 place-items-center rounded-full border border-dashed border-slate-600 text-slate-500`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
    );
  }
  return (
    <span
      title={name}
      className={`${dims} ${avatarColor(name)} grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-slate-950`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * A small popover under its trigger. Rendered in a portal with fixed positioning
 * so scrolling tables can't clip it. Closes on outside click, Escape, or scroll.
 */
export function Popover({
  trigger,
  children,
  align = "left",
  className = "",
}: {
  trigger: (props: { open: boolean; toggle: (e: React.MouseEvent<HTMLElement>) => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    if (open) return setPos(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const below = rect.bottom + 4;
    // Flip above the trigger when there isn't room underneath.
    const top = below + 260 > window.innerHeight && rect.top > 280 ? Math.max(8, rect.top - 264) : below;
    setPos(align === "right" ? { top, right: window.innerWidth - rect.right } : { top, left: rect.left });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className={className}>
      {trigger({ open, toggle })}
      {pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, right: pos.right }}
            className="fixed z-[100] max-h-64 min-w-44 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1.5 shadow-2xl shadow-black/60"
          >
            {children(() => setPos(null))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${
        danger ? "text-red-300 hover:bg-red-500/10" : "text-slate-200 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

export function StatusPill({ status, className = "" }: { status: ItemStatus; className?: string }) {
  const s = STATUS_BY_ID[status] ?? STATUS_BY_ID.open;
  return <span className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold ${s.pill} ${className}`}>{s.label}</span>;
}

/** Status cell: the whole cell is the colored pill; click to change. */
export function StatusPicker({
  status,
  onChange,
  full = false,
}: {
  status: ItemStatus;
  onChange: (status: ItemStatus) => void;
  full?: boolean;
}) {
  const s = STATUS_BY_ID[status] ?? STATUS_BY_ID.open;
  return (
    <Popover
      className={full ? "h-full w-full" : ""}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Status: ${s.label}. Change status`}
          className={`${s.pill} ${
            full ? "h-full w-full rounded-none" : "rounded-md px-2.5 py-1"
          } text-xs font-semibold transition hover:brightness-110`}
        >
          {s.label}
        </button>
      )}
    >
      {(close) =>
        STATUSES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              close();
              if (opt.id !== status) onChange(opt.id);
            }}
            className={`mb-1 block w-full rounded-md px-3 py-1.5 text-center text-xs font-semibold last:mb-0 ${opt.pill} ${
              opt.id === status ? "ring-2 ring-white/60" : "hover:brightness-110"
            }`}
          >
            {opt.label}
          </button>
        ))
      }
    </Popover>
  );
}

export function PriorityPicker({
  priority,
  onChange,
  full = false,
}: {
  priority: Priority | null;
  onChange: (priority: Priority | null) => void;
  full?: boolean;
}) {
  const p = priority ? PRIORITY_BY_ID[priority] : null;
  return (
    <Popover
      className={full ? "h-full w-full" : ""}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Priority: ${p?.label ?? "none"}. Change priority`}
          className={`${p ? p.pill : "text-slate-500 hover:bg-white/5"} ${
            full ? "h-full w-full rounded-none" : "rounded-md px-2.5 py-1"
          } text-xs font-semibold transition hover:brightness-110`}
        >
          {p?.label ?? "–"}
        </button>
      )}
    >
      {(close) => (
        <>
          {PRIORITIES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                close();
                if (opt.id !== priority) onChange(opt.id);
              }}
              className={`mb-1 block w-full rounded-md px-3 py-1.5 text-center text-xs font-semibold ${opt.pill} ${
                opt.id === priority ? "ring-2 ring-white/60" : "hover:brightness-110"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <MenuItem
            onClick={() => {
              close();
              if (priority) onChange(null);
            }}
          >
            <span className="w-full text-center text-xs text-slate-400">Clear</span>
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

export function PriorityFlag({ priority }: { priority: Priority | null }) {
  if (!priority) return null;
  const p = PRIORITY_BY_ID[priority];
  return (
    <span title={`${p.label} priority`} className={`inline-flex items-center gap-1 text-xs font-medium ${p.flag}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M5 21V4h11l-1.5 4L16 12H7v9z" />
      </svg>
      {p.label}
    </span>
  );
}

/** A date shown as text that turns into a native date picker on click. */
export function DateField({
  value,
  onChange,
  today,
  overdue = false,
  label,
  className = "",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  today: string | null;
  overdue?: boolean;
  label: string;
  className?: string;
}) {
  const text = value ? relativeDue(value, today, formatDate) : "–";
  return (
    <label className={`relative flex cursor-pointer items-center justify-center ${className}`}>
      <span className={`pointer-events-none text-xs ${overdue ? "font-semibold text-red-400" : value ? "text-slate-200" : "text-slate-500"}`}>
        {text}
      </span>
      <input
        type="date"
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]"
      />
    </label>
  );
}

export function ProgressBar({ done, total, className = "" }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/10 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Horizontal bar split by status (like a battery). */
export function StatusBar({ counts, className = "" }: { counts: Record<ItemStatus, number>; className?: string }) {
  const total = STATUSES.reduce((n, s) => n + counts[s.id], 0);
  if (!total) return <div className={`h-2 rounded-full bg-white/10 ${className}`} />;
  return (
    <div className={`flex h-2 overflow-hidden rounded-full bg-white/10 ${className}`}>
      {STATUSES.map((s) =>
        counts[s.id] ? (
          <div
            key={s.id}
            className={s.dot}
            style={{ width: `${(counts[s.id] / total) * 100}%` }}
            title={`${s.label}: ${counts[s.id]}`}
          />
        ) : null,
      )}
    </div>
  );
}

export function statusCounts(tasks: { status: ItemStatus }[]) {
  const counts: Record<ItemStatus, number> = { open: 0, in_progress: 0, stuck: 0, done: 0 };
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return counts;
}

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export type IconName =
  | "home"
  | "check"
  | "folder"
  | "card"
  | "search"
  | "plus"
  | "table"
  | "board"
  | "calendar"
  | "timeline"
  | "chart"
  | "notes"
  | "log"
  | "comment"
  | "subtask"
  | "x"
  | "dots"
  | "sparkles"
  | "menu"
  | "trash"
  | "chevron"
  | "logout"
  | "filter";

const ICONS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  folder: <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 4v16" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="10" rx="1.5" />
      <rect x="17" y="4" width="4" height="13" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  timeline: <path d="M4 6h9M8 12h11M4 18h7M4 3v18" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  notes: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h7M9 16h5" />
    </>
  ),
  log: <path d="M4 6h16M4 12h16M4 18h10" />,
  comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  subtask: <path d="M5 4v10a3 3 0 0 0 3 3h11M15 13l4 4-4 4" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  dots: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />,
  sparkles: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
};
