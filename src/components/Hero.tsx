import DashboardMock from "./DashboardMock";

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Background glow + grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10rem] h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-2 lg:pb-28">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            AI that turns meeting notes into action
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Every engineering project, <span className="text-orange-400">organized in one place.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400 lg:mx-0">
            Forgeboard brings your team&apos;s tasks, decisions, requirements, notes, and files into one hub — and
            its AI turns messy meeting notes into owned, dated action items automatically.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href="/signup"
              className="w-full rounded-lg bg-orange-500 px-6 py-3 text-center font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 sm:w-auto"
            >
              Start free trial
            </a>
            <a
              href="#how-it-works"
              className="w-full rounded-lg border border-white/15 px-6 py-3 text-center font-semibold text-white transition hover:bg-white/5 sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">Free trial includes 3 AI extractions · No credit card required</p>
        </div>

        <DashboardMock />
      </div>
    </section>
  );
}
