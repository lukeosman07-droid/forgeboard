import Section from "./Section";
import Icon, { type IconName } from "./Icon";

const features: { icon: IconName; title: string; body: string; highlight?: boolean }[] = [
  {
    icon: "sparkles",
    title: "AI notes → action items",
    body: "Paste meeting notes, an email thread, or a spec. Forgeboard pulls out action items with owners and due dates, decisions, and open risks — and files them for you.",
    highlight: true,
  },
  {
    icon: "hub",
    title: "One project hub",
    body: "Tasks, decisions, requirements, notes, and files for each project live together in a single organized workspace.",
  },
  {
    icon: "gavel",
    title: "Decision log",
    body: "Every decision is recorded with who made it, when, and why — so nobody has to re-litigate it next month.",
  },
  {
    icon: "list",
    title: "Requirements tracking",
    body: "Keep requirements and specs versioned and linked to the tasks and decisions that satisfy them.",
  },
  {
    icon: "folder",
    title: "File organization",
    body: "Drawings, CAD exports, test data, and datasheets stay attached to the project — not lost in a shared drive.",
  },
  {
    icon: "users",
    title: "Team visibility",
    body: "See who owns what and what's due this week across mechanical, electrical, civil, and manufacturing.",
  },
];

export default function Features() {
  return (
    <Section
      id="features"
      eyebrow="Features"
      title="Everything your project needs, in one hub"
      intro="Built for mechanical, electrical, civil, and manufacturing teams that need a single source of truth."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className={`rounded-2xl border p-6 transition hover:-translate-y-0.5 ${
              f.highlight
                ? "border-orange-500/40 bg-gradient-to-b from-orange-500/10 to-slate-900/60"
                : "border-white/10 bg-slate-900/60 hover:border-white/20"
            }`}
          >
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-orange-500/15 text-orange-400">
              <Icon name={f.icon} />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-slate-400">{f.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
