// A product preview drawn entirely with HTML + Tailwind (no image files).

const actions = [
  { task: "Re-run FEA on bracket v3 with updated loads", owner: "PM", color: "bg-sky-500", due: "Nov 8" },
  { task: "Send revised BOM to supplier for quote", owner: "JR", color: "bg-emerald-500", due: "Nov 10" },
  { task: "Confirm PCB connector pinout with EE team", owner: "AK", color: "bg-violet-500", due: "Nov 12" },
];

export default function DashboardMock() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none" aria-label="Preview of the Forgeboard dashboard" role="img">
      <div aria-hidden className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-orange-500/20 via-transparent to-sky-500/10 blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl">
        {/* Window bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-slate-700" />
            <span className="h-3 w-3 rounded-full bg-slate-700" />
            <span className="h-3 w-3 rounded-full bg-slate-700" />
          </div>
          <span className="text-xs text-slate-500">Drone Frame Rev B</span>
          <span className="w-12" />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {/* AI extraction banner */}
          <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-orange-500 text-xs font-bold text-slate-950">
              AI
            </span>
            <div className="text-sm">
              <p className="font-medium text-orange-200">Extracted from &ldquo;Design review – Nov 3&rdquo;</p>
              <p className="text-slate-400">3 action items · 2 decisions · 1 open risk</p>
            </div>
          </div>

          {/* Action items */}
          <div className="rounded-xl border border-white/10 bg-slate-950/60">
            <p className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Action items
            </p>
            <ul className="divide-y divide-white/5">
              {actions.map((a) => (
                <li key={a.task} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-4 w-4 shrink-0 rounded border border-slate-600" />
                  <span className="flex-1 text-sm text-slate-200">{a.task}</span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${a.color}`}>
                    {a.owner}
                  </span>
                  <span className="hidden w-12 shrink-0 text-right text-xs text-slate-500 sm:block">{a.due}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Decisions + risks */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Decision log</p>
              <p className="mt-2 text-sm text-slate-200">Switch arm material to 6061-T6 aluminum</p>
              <p className="mt-1 text-xs text-slate-500">Approved · Nov 3</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Open risk</p>
              <p className="mt-2 text-sm text-slate-200">Motor mount lead time may slip 2 weeks</p>
              <span className="mt-2 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                Needs owner
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
