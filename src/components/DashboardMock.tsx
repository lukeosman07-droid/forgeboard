// A product preview drawn entirely with HTML + Tailwind (no image files).

const groups = [
  {
    name: "Design",
    color: "bg-sky-500",
    text: "text-sky-400",
    rows: [
      { task: "Finalize electrical one-line", owner: "DP", ownerColor: "bg-violet-600", status: "Working on it", statusColor: "bg-amber-500 text-slate-950", due: "Nov 14", priority: "High" },
      { task: "Size discharge header", owner: "SO", ownerColor: "bg-emerald-600", status: "Stuck", statusColor: "bg-rose-500 text-white", due: "Nov 12", priority: "Urgent" },
      { task: "Collect as-built drawings", owner: "MC", ownerColor: "bg-pink-600", status: "Done", statusColor: "bg-emerald-500 text-slate-950", due: "Nov 6", priority: "Low" },
    ],
  },
  {
    name: "Procurement",
    color: "bg-violet-500",
    text: "text-violet-400",
    rows: [
      { task: "Order VFD pumps (16 wk lead)", owner: "MC", ownerColor: "bg-pink-600", status: "To do", statusColor: "bg-slate-500/80 text-white", due: "Nov 20", priority: "High" },
    ],
  },
];

const views = ["Overview", "Table", "Board", "Calendar", "Timeline"];

export default function DashboardMock() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none" aria-label="Preview of a Forgeboard project in Table view" role="img">
      <div aria-hidden className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-orange-500/20 via-transparent to-sky-500/10 blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl">
        {/* Window bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-slate-700" />
            <span className="h-3 w-3 rounded-full bg-slate-700" />
            <span className="h-3 w-3 rounded-full bg-slate-700" />
          </div>
          <span className="text-xs text-slate-500">Pump Station Retrofit</span>
          <span className="w-12" />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {/* View tabs */}
          <div className="flex gap-4 border-b border-white/10 text-xs">
            {views.map((v) => (
              <span key={v} className={`-mb-px border-b-2 pb-2 ${v === "Table" ? "border-orange-500 text-white" : "border-transparent text-slate-500"}`}>
                {v}
              </span>
            ))}
          </div>

          {/* AI status */}
          <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-orange-500 text-xs font-bold text-slate-950">AI</span>
            <div className="text-sm">
              <p className="font-medium text-orange-200">
                Status: <span className="text-amber-300">At risk</span>
              </p>
              <p className="text-slate-400">Header sizing is stuck on vendor pump curves; order pumps this week to hold the cutover date.</p>
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.name}>
              <p className={`mb-1.5 text-sm font-semibold ${g.text}`}>{g.name}</p>
              <div className="overflow-hidden rounded-lg border border-white/10">
                {g.rows.map((r) => (
                  <div key={r.task} className="grid grid-cols-[1fr_auto_6.5rem] items-stretch border-b border-white/5 bg-slate-950/60 text-xs last:border-b-0 sm:grid-cols-[1fr_auto_6.5rem_3.5rem]">
                    <div className="relative flex items-center py-2.5 pl-4 pr-2">
                      <span className={`absolute inset-y-0 left-0 w-1 ${g.color}`} />
                      <span className={`truncate ${r.status === "Done" ? "text-slate-500 line-through" : "text-slate-200"}`}>{r.task}</span>
                    </div>
                    <div className="flex items-center px-2">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-bold text-white ${r.ownerColor}`}>{r.owner}</span>
                    </div>
                    <div className={`flex items-center justify-center font-semibold ${r.statusColor}`}>{r.status}</div>
                    <div className="hidden items-center justify-center text-slate-400 sm:flex">{r.due}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
