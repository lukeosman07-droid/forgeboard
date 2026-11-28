"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { searchWorkspace, type SearchMatch, type SearchResults } from "@/server/search";
import { Icon, StatusPill } from "@/components/work/ui";
import { colorOf } from "@/lib/work";
import { useWorkspace, useWorkspacePath } from "./workspace-context";

// Ctrl/⌘ + K search across projects, tasks, comments and meeting notes, plus
// quick navigation.

type Result = { key: string; label: React.ReactNode; hint?: React.ReactNode; href: string };

// Paths are relative to the workspace.
const PAGES = [
  { key: "home", label: "Home", path: "" },
  { key: "my-work", label: "My work", path: "/my-work" },
  { key: "inbox", label: "Inbox", path: "/inbox" },
  { key: "members", label: "Members", path: "/members" },
  { key: "billing", label: "Billing", path: "/billing" },
  { key: "settings", label: "Settings", path: "/settings" },
];

export default function CommandPalette() {
  const router = useRouter();
  const { slug } = useWorkspace();
  const path = useWorkspacePath();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ projects: [], matches: [] });
  const [active, setActive] = useState(0);
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  const requestId = useRef(0);

  const open = () => {
    setQuery("");
    setActive(0);
    dialogRef.current?.showModal();
    search("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else open();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(q: string) {
    const id = ++requestId.current;
    // Small delay so we don't search on every keystroke.
    setTimeout(async () => {
      if (id !== requestId.current) return;
      const data = await searchWorkspace(slug, q).catch(() => null);
      if (data && id === requestId.current) setResults(data);
    }, q ? 150 : 0);
  }

  const q = query.trim().toLowerCase();
  const items: Result[] = [
    ...PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)).map((p) => ({ key: p.key, label: p.label, href: path(p.path) })),
    ...results.projects.map((p) => ({
      key: `p-${p.id}`,
      label: (
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-sm ${colorOf(p.color).dot}`} />
          {p.name}
        </span>
      ),
      hint: "Project",
      href: path(`/projects/${p.id}`),
    })),
    ...results.matches.map((m) => ({
      key: `${m.kind}-${m.id}`,
      label: <MatchLabel match={m} />,
      hint: (
        <span className="flex items-center gap-2">
          <span className="max-w-32 truncate">{m.project_name}</span>
          {m.kind === "document" ? (
            "Notes"
          ) : m.kind === "rfi" ? (
            "RFI"
          ) : m.kind === "submittal" ? (
            "Submittal"
          ) : m.item_type === "action_item" && m.status ? (
            <StatusPill status={m.status} className="!py-0.5" />
          ) : (
            "Log"
          )}
        </span>
      ),
      href: path(matchPath(m)),
    })),
  ];

  const go = (r: Result | undefined) => {
    if (!r) return;
    dialogRef.current?.close();
    router.push(r.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex w-full max-w-md items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-400 hover:border-white/20 hover:text-slate-200"
      >
        <Icon name="search" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden rounded border border-white/10 px-1.5 text-[11px] text-slate-500 sm:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Icon name="search" className="h-5 w-5 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              search(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="Search tasks, comments and notes…"
            aria-label="Search"
            className="h-14 flex-1 bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-white/10 px-1.5 text-[11px] text-slate-500">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches.</li>}
          {items.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  i === active ? "bg-white/10 text-white" : "text-slate-300"
                }`}
              >
                <span className="min-w-0 truncate">{r.label}</span>
                {r.hint && <span className="shrink-0 text-xs text-slate-500">{r.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}

function matchPath(m: SearchMatch) {
  if (m.kind === "document") return `/projects/${m.project_id}?view=notes&doc=${m.id}`;
  if (m.kind === "rfi") return `/projects/${m.project_id}?view=rfis&rfi=${m.id}`;
  if (m.kind === "submittal") return `/projects/${m.project_id}?view=submittals&submittal=${m.id}`;
  if (m.item_type !== "action_item") return `/projects/${m.project_id}?view=log`;
  return `/projects/${m.project_id}?view=table&task=${m.item_id}`;
}

/** The title, plus the matching words in context for comments and notes. */
function MatchLabel({ match }: { match: SearchMatch }) {
  // A task found by its title alone has no highlighted words in its details.
  const showSnippet = !!match.snippet && (match.kind !== "task" || match.snippet.includes("«"));
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5 truncate">
        {match.kind === "comment" && <span className="shrink-0 text-xs text-slate-500">Comment on</span>}
        <span className="truncate">{match.title}</span>
      </span>
      {showSnippet && (
        <span className="block truncate text-xs text-slate-500">
          {match.snippet!.split(/(«[^»]*»)/).map((part, i) =>
            part.startsWith("«") ? (
              <mark key={i} className="rounded bg-orange-500/20 px-0.5 text-orange-200">
                {part.slice(1, -1)}
              </mark>
            ) : (
              part
            ),
          )}
        </span>
      )}
    </span>
  );
}
