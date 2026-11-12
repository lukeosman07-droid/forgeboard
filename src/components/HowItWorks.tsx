import Section from "./Section";

const steps = [
  {
    title: "Describe your project",
    body: "Start blank, pick a template, or describe the work and let AI draft the phases, tasks and schedule.",
  },
  {
    title: "Run it your way",
    body: "Track work in a table, board, calendar or timeline. Paste meeting notes and AI turns them into tasks.",
  },
  {
    title: "Report in one click",
    body: "See progress, workload and overdue work at a glance, and let AI write the weekly status update.",
  },
];

export default function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="From idea to delivered project in three steps"
      className="border-y border-white/5 bg-slate-900/40"
    >
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl border border-white/10 bg-slate-950/60 p-6">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-orange-500 font-bold text-slate-950">
              {i + 1}
            </span>
            <h3 className="mt-5 text-lg font-semibold text-white">{s.title}</h3>
            <p className="mt-2 text-slate-400">{s.body}</p>
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute right-[-1.1rem] top-10 hidden text-2xl text-slate-600 md:block">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
