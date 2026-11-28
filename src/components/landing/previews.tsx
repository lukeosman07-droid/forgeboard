import type { ReactNode } from "react";

// Product previews for the landing page, drawn in HTML so they stay sharp and
// match the app. Each mirrors a real screen, with the statuses, labels and
// colors the app uses, filled with the demo project's data
// (scripts/seed-demo.mjs). They are pictures, so screen readers get a
// one-line description instead of the table soup.

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${className}`}>{children}</span>;
}

/** A browser-ish frame with the project name and the project's tab bar. */
export function AppWindow({
  label,
  active,
  title = "Pump Station Retrofit",
  children,
  className = "",
}: {
  label: string;
  active?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tabs = ["Overview", "Table", "Board", "Calendar", "Timeline", "Decisions & Risks", "RFIs", "Submittals", "Milestones & Reviews"];
  return (
    <div role="img" aria-label={label} className={`overflow-hidden rounded-xl border border-white/10 bg-[#0b1120] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ${className}`}>
      <div className="flex items-center gap-3 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        </div>
        <span className="truncate font-mono text-[11px] text-slate-500">forgeboard · {title}</span>
      </div>
      {active && (
        <div className="flex gap-4 overflow-hidden border-b border-white/[0.07] px-4 text-[11px] text-slate-500 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:px-5" aria-hidden>
          {tabs.map((t) => (
            <span key={t} className={`-mb-px shrink-0 border-b-2 py-2 ${t === active ? "border-orange-500 text-slate-100" : "border-transparent"}`}>
              {t}
            </span>
          ))}
        </div>
      )}
      <div aria-hidden>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RFI log (hero)
// ---------------------------------------------------------------------------

const RFIS = [
  { n: "RFI-004", subject: "Discharge header material at wall penetration", court: "Atlas Pump Co.", required: "Dec 9", days: 2, status: "Open", pill: "bg-amber-500 text-slate-950" },
  { n: "RFI-003", subject: "Anchor bolt embedment at existing pump pad", court: "Jen Alvarez", required: "Dec 4", days: 6, status: "Open", pill: "bg-amber-500 text-slate-950", overdue: true },
  { n: "RFI-002", subject: "City PLC standard for SCADA integration", court: "Priya Shah", required: "Nov 21", days: 7, status: "Answered", pill: "bg-sky-500 text-slate-950" },
  { n: "RFI-001", subject: "Available fault current at service entrance", court: "City Electric Utility", required: "Dec 12", days: 9, status: "Open", pill: "bg-amber-500 text-slate-950" },
];

export function RfiLogPreview() {
  return (
    <AppWindow label="The RFI log in Forgeboard: numbered RFIs with ball in court, required dates, days open and status." active="RFIs">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950">+ New RFI</span>
            <span className="hidden rounded-md border border-white/10 p-0.5 text-[11px] text-slate-400 sm:flex">
              <span className="rounded bg-white/10 px-2 py-0.5 text-slate-100">All 4</span>
              <span className="px-2 py-0.5">Open 3</span>
              <span className="px-2 py-0.5">Answered 1</span>
              <span className="px-2 py-0.5">Closed 0</span>
            </span>
            <span className="text-[11px] text-slate-400">
              3 open · <span className="text-red-400">1 overdue</span>
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500">Export log: CSV · PDF</span>
        </div>

        <div className="fb-in-rows mt-4 overflow-hidden rounded-lg border border-white/[0.07]">
          <div className="grid grid-cols-[4.2rem_1fr_4.5rem] gap-3 border-b border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:grid-cols-[4.2rem_1fr_7.5rem_4rem_3.5rem_4.5rem]">
            <span>No.</span>
            <span>Subject</span>
            <span className="hidden sm:block">Ball in court</span>
            <span className="hidden sm:block">Required</span>
            <span className="hidden text-right sm:block">Days</span>
            <span>Status</span>
          </div>
          {RFIS.map((r) => (
            <div
              key={r.n}
              className="grid grid-cols-[4.2rem_1fr_4.5rem] items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 text-[11.5px] last:border-b-0 sm:grid-cols-[4.2rem_1fr_7.5rem_4rem_3.5rem_4.5rem]"
            >
              <span className="font-mono text-slate-400">{r.n}</span>
              <span className="truncate text-slate-100">{r.subject}</span>
              <span className="hidden truncate text-slate-400 sm:block">{r.court}</span>
              <span className={`hidden sm:block ${r.overdue ? "font-semibold text-red-400" : "text-slate-400"}`}>{r.required}</span>
              <span className="hidden text-right tabular-nums text-slate-300 sm:block">{r.days}</span>
              <span>
                <Pill className={r.pill}>{r.status}</Pill>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 hidden items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 sm:flex">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Open questions from your notes</p>
            <p className="mt-0.5 truncate text-[11.5px] text-slate-300">Does the city require a backup generator for this station class?</p>
          </div>
          <span className="ml-4 shrink-0 rounded border border-orange-500/40 px-2 py-1 text-[10.5px] font-medium text-orange-300">Create RFI</span>
        </div>
      </div>
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// Submittal panel
// ---------------------------------------------------------------------------

export function SubmittalPreview() {
  const history = [
    { rev: "Rev 1", received: "Nov 26", action: "Under review", pill: "bg-slate-600 text-white", note: "Due Dec 3" },
    { rev: "Rev 0", received: "Nov 14", action: "Revise & resubmit", pill: "bg-amber-500 text-slate-950", note: "Pump curve missing the duty point at minimum speed." },
  ];
  return (
    <AppWindow label="A submittal in Forgeboard: spec section, reviewer, dates, the current action and the revision history.">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-slate-500">S-001 Rev 1 · Spec 43 21 13</p>
            <p className="mt-1 text-[15px] font-semibold text-white">VFD pump product data</p>
          </div>
          <Pill className="bg-slate-600 text-white">Under review</Pill>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[11.5px] sm:grid-cols-4">
          {[
            ["Submitted by", "Atlas Pump Co."],
            ["Reviewer", "Sam Ortiz"],
            ["Received", "Nov 26"],
            ["Due", "Dec 3"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px]">
          {["Approved", "Approved as noted", "Revise & resubmit", "Rejected"].map((a) => (
            <span key={a} className="rounded border border-white/10 px-2 py-1 text-slate-400">
              {a}
            </span>
          ))}
        </div>
        <p className="mt-5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Revision history</p>
        <ol className="mt-2 space-y-2">
          {history.map((h) => (
            <li key={h.rev} className="grid grid-cols-[3rem_1fr] gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[11.5px]">
              <span className="font-mono text-slate-400">{h.rev}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill className={h.pill}>{h.action}</Pill>
                  <span className="text-slate-500">Received {h.received}</span>
                </div>
                <p className="mt-1 text-slate-400">{h.note}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[11px] text-slate-400">
          <span>Linked task: Issue purchase order for VFD pumps</span>
          <span className="font-mono text-slate-500">2 files</span>
        </div>
      </div>
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// Timeline with dependencies
// ---------------------------------------------------------------------------

// Bars on a 10-week grid. The PO starts before the one-line it waits on is
// due, so it's flagged, the way the app flags it.
const BARS = [
  { name: "Finalize electrical one-line", start: 0, len: 3, color: "bg-amber-400/80" },
  { name: "Issue PO for VFD pumps", start: 2, len: 1.2, color: "bg-slate-400/70", conflict: true },
  { name: "Install pumps and VFDs", start: 4, len: 3, color: "bg-slate-400/70" },
  { name: "SCADA integration", start: 5.6, len: 2.2, color: "bg-slate-400/70" },
  { name: "Station cutover", start: 8.3, len: 1, color: "bg-slate-400/70" },
];
// [predecessor, successor] rows.
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 4],
  [3, 4],
];
const ROW = 36;
const WEEKS = 10;
const MILESTONE = 3.8;

function linkPath(a: number, b: number) {
  const x = (n: number) => (n / WEEKS) * 100;
  const from = BARS[a];
  const to = BARS[b];
  const endX = from.start + from.len;
  const yA = a * ROW + ROW / 2;
  const yB = b * ROW + ROW / 2;
  const out = endX + 0.15;
  if (to.start >= out + 0.1) return `M${x(endX)} ${yA} H${x(out)} V${yB} H${x(to.start)}`;
  // The successor starts too early: route back around, like the app does.
  const mid = a * ROW + ROW;
  return `M${x(endX)} ${yA} H${x(out)} V${mid} H${x(to.start - 0.15)} V${yB} H${x(to.start)}`;
}

export function TimelinePreview() {
  const pct = (n: number) => `${(n / WEEKS) * 100}%`;
  const height = (BARS.length + 1) * ROW;
  return (
    <AppWindow
      label="The timeline in Forgeboard: task bars linked by dependency arrows, a milestone, and a conflict flagged where a task starts before the one it waits on is due."
      active="Timeline"
    >
      <div className="p-4 sm:p-5">
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
          ⚠ 1 task starts before a task it waits on is due: Issue PO for VFD pumps (waits on Finalize electrical one-line)
        </p>
        <div className="mt-4 grid grid-cols-[7.25rem_1fr] text-[11px] sm:grid-cols-[10.5rem_1fr]">
          <div />
          <div className="relative h-6 border-b border-white/[0.07] font-mono text-[9.5px] text-slate-500">
            {["Dec 1", "Dec 15", "Dec 29", "Jan 12", "Jan 26"].map((d, i) => (
              <span key={d} className={`absolute top-0 whitespace-nowrap ${i % 2 ? "hidden sm:inline" : ""}`} style={{ left: pct(i * 2) }}>
                {d}
              </span>
            ))}
          </div>

          <div>
            {BARS.map((b) => (
              <div key={b.name} className="flex items-center gap-1 border-b border-white/[0.04] pr-2 text-slate-300" style={{ height: ROW }}>
                <span className="truncate">{b.name}</span>
                {b.conflict && <span className="text-amber-400">⚠</span>}
              </div>
            ))}
            <div className="flex items-center pr-2 text-slate-300" style={{ height: ROW }}>
              <span className="truncate">◆ Construction start</span>
            </div>
          </div>

          <div className="relative" style={{ height }}>
            {/* Week lines */}
            {Array.from({ length: WEEKS / 2 }, (_, i) => (
              <span key={i} className="absolute inset-y-0 border-l border-white/[0.04]" style={{ left: pct(i * 2) }} />
            ))}
            {BARS.map((b, i) => (
              <div key={b.name} className="absolute inset-x-0 border-b border-white/[0.04]" style={{ top: i * ROW, height: ROW }}>
                <div
                  className={`fb-bar absolute top-1/2 h-4 -translate-y-1/2 rounded ${b.color} ${b.conflict ? "outline outline-1 outline-offset-1 outline-amber-400" : ""}`}
                  style={{ left: pct(b.start), width: pct(b.len), ["--b" as string]: i }}
                />
              </div>
            ))}
            <svg className="fb-late pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
              {LINKS.map(([a, b]) => {
                const conflict = !!BARS[b].conflict;
                return (
                  <path
                    key={`${a}-${b}`}
                    d={linkPath(a, b)}
                    fill="none"
                    stroke={conflict ? "rgb(251 191 36)" : "rgb(148 163 184 / 0.7)"}
                    strokeWidth={1.25}
                    strokeDasharray={conflict ? "4 3" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {LINKS.map(([a, b]) => (
              <span
                key={`dot-${a}-${b}`}
                className={`fb-late absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${BARS[b].conflict ? "bg-amber-400" : "bg-slate-300"}`}
                style={{ left: pct(BARS[b].start), top: b * ROW + ROW / 2 }}
              />
            ))}
            <span className="fb-late absolute border-l border-dashed border-orange-400/50" style={{ left: pct(MILESTONE), top: 0, bottom: ROW / 2 }} />
            <span
              className="fb-late absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-orange-300 bg-orange-500"
              style={{ left: pct(MILESTONE), top: BARS.length * ROW + ROW / 2 }}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-500">
          <span>— waits on</span>
          <span className="text-amber-300/80">- - conflict</span>
          <span>◆ milestone</span>
        </div>
      </div>
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// Design review
// ---------------------------------------------------------------------------

const COMMENTS = [
  { title: "Show the bypass pumping connection on the mechanical plan", who: "Sam", disp: "Incorporate", pill: "bg-sky-500 text-slate-950", state: "To do" },
  { title: "Label the VFD bypass contactors on the one-line", who: "Dev", disp: "Incorporate", pill: "bg-sky-500 text-slate-950", state: "Done" },
  { title: "Move the MCC to the north wall", who: "Maria", disp: "Rejected", pill: "bg-rose-500 text-white", state: "No room for required clearances" },
  { title: "Consider a second wet well level transmitter", who: "Priya", disp: "Needs disposition", pill: "bg-slate-600 text-white", state: "" },
];

export function ReviewPreview() {
  return (
    <AppWindow label="A design review in Forgeboard: comments with owners and dispositions, and a close-out that waits until every comment is resolved." active="Milestones & Reviews">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-slate-500">Milestone · 60% design</p>
            <p className="mt-1 text-[15px] font-semibold text-white">60% design review comments</p>
          </div>
          <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-slate-500">Close review</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">1 comment still needs a disposition and 1 to incorporate isn&apos;t done yet.</p>
        <ul className="fb-stagger mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.07]">
          {COMMENTS.map((c) => (
            <li key={c.title} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-[11.5px]">
              <div className="min-w-0">
                <p className={`truncate ${c.state === "Done" ? "text-slate-500 line-through" : "text-slate-100"}`}>{c.title}</p>
                <p className="mt-0.5 truncate text-[10.5px] text-slate-500">
                  {c.who}
                  {c.state && ` · ${c.state}`}
                </p>
              </div>
              <Pill className={c.pill}>{c.disp}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------

const PEOPLE = [
  { name: "Maria Chen", overdue: 0, weeks: [2, 3, 1, 2, 0, 1], none: 0 },
  { name: "Dev Patel", overdue: 1, weeks: [4, 6, 2, 1, 1, 0], none: 1 },
  { name: "Sam Ortiz", overdue: 2, weeks: [3, 2, 2, 0, 1, 1], none: 0 },
  { name: "Priya Shah", overdue: 0, weeks: [1, 2, 3, 3, 2, 0], none: 2 },
  { name: "Jen Alvarez", overdue: 0, weeks: [0, 1, 1, 2, 0, 0], none: 0 },
];

function cell(n: number) {
  if (n === 0) return "text-slate-600";
  if (n >= 5) return "bg-orange-500/30 text-orange-100";
  if (n >= 3) return "bg-orange-500/15 text-orange-200";
  return "bg-white/[0.04] text-slate-300";
}

export function WorkloadPreview() {
  const weeks = ["12/1", "12/8", "12/15", "12/22", "12/29", "1/5"];
  return (
    <AppWindow title="Workload" label="The workload view in Forgeboard: open tasks per person per week across every project, with overdue work called out.">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-white">Workload · all projects</p>
          <span className="rounded-md border border-white/10 px-2 py-1 text-[10.5px] text-slate-400">Next 6 weeks</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.07]">
          <table className="w-full table-fixed text-[11px]">
            <thead>
              <tr className="bg-white/[0.03] text-[9.5px] uppercase tracking-wide text-slate-500">
                <th className="w-[28%] px-3 py-2 text-left font-medium">Person</th>
                <th className="px-1 py-2 font-medium text-red-300/80">Late</th>
                {weeks.map((w, i) => (
                  <th key={w} className={`whitespace-nowrap px-1 py-2 font-medium ${i > 3 ? "hidden sm:table-cell" : ""}`}>
                    {w}
                  </th>
                ))}
                <th className="hidden whitespace-nowrap px-1 py-2 font-medium md:table-cell">No date</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="fb-stagger">
              {PEOPLE.map((p) => {
                const total = p.overdue + p.weeks.reduce((a, b) => a + b, 0) + p.none;
                return (
                  <tr key={p.name} className="border-t border-white/[0.05]">
                    <td className="truncate px-3 py-2 text-slate-200">{p.name}</td>
                    <td className="p-1 text-center">
                      <span className={`block rounded py-1 tabular-nums ${p.overdue ? "bg-red-500/15 text-red-200" : "text-slate-600"}`}>{p.overdue}</span>
                    </td>
                    {p.weeks.map((n, i) => (
                      <td key={i} className={`p-1 text-center ${i > 3 ? "hidden sm:table-cell" : ""}`}>
                        <span className={`block rounded py-1 tabular-nums ${cell(n)}`}>{n}</span>
                      </td>
                    ))}
                    <td className="hidden p-1 text-center md:table-cell">
                      <span className={`block rounded py-1 tabular-nums ${p.none ? "bg-white/[0.04] text-slate-300" : "text-slate-600"}`}>{p.none}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-white">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// Minutes in, tracked items out
// ---------------------------------------------------------------------------

export function CapturePreview() {
  const items = [
    { kind: "Task", text: "Finalize the electrical one-line", meta: "Dev · due Dec 5 · p. 2" },
    { kind: "Decision", text: "Use VFD-driven pumps instead of soft starters", meta: "p. 1" },
    { kind: "Risk", text: "Pump lead time may exceed 16 weeks", meta: "High · p. 3" },
    { kind: "Question", text: "Does the city require a backup generator?", meta: "Maria · p. 3" },
  ];
  return (
    <div role="img" aria-label="Meeting minutes on the left; on the right, the action items, decisions, risks and questions found in them, each with the page it came from, waiting for review." className="grid overflow-hidden rounded-xl border border-white/10 bg-[#0b1120] md:grid-cols-2">
      <div className="border-b border-white/[0.07] p-4 md:border-b-0 md:border-r sm:p-5" aria-hidden>
        <p className="font-mono text-[10.5px] text-slate-500">60pct-review-minutes.pdf · page 3 of 4</p>
        <div className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-slate-400">
          <p>Sam noted the vendor quoted 16 to 18 weeks for the VFD pump package, which could push cutover past the low-flow season.</p>
          <p>
            <mark className="fb-mark rounded bg-orange-500/20 px-0.5 text-orange-100">Open question: does the city require a backup generator for this station class?</mark> Maria to follow up with the utility.
          </p>
          <p>Bypass pumping during cutover is not in the current budget.</p>
        </div>
      </div>
      <div className="p-4 sm:p-5" aria-hidden>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Found in this document · review before adding</p>
        <ul className="fb-items mt-3 space-y-2">
          {items.map((i) => (
            <li key={i.text} className="flex items-start gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11.5px]">
              <span className="fb-check mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm bg-orange-500 text-slate-950">
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2.5 6.5l2.2 2.2L9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-slate-100">
                  <span className="mr-1.5 font-mono text-[10px] uppercase text-slate-500">{i.kind}</span>
                  {i.text}
                </p>
                <p className="mt-0.5 text-[10.5px] text-slate-500">{i.meta}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">4 of 4 selected</span>
          <span className="rounded-md bg-orange-500 px-2.5 py-1 font-semibold text-slate-950">Add 4 items</span>
        </div>
      </div>
    </div>
  );
}
