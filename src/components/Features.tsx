import Section from "./Section";
import Icon, { type IconName } from "./Icon";

const features: { icon: IconName; title: string; body: string; highlight?: boolean }[] = [
  {
    icon: "sparkles",
    title: "AI project plans",
    body: "Describe a project in a few sentences. Forgeboard drafts the phases, tasks and a realistic schedule, ready to edit.",
    highlight: true,
  },
  {
    icon: "list",
    title: "AI notes → tasks",
    body: "Paste meeting notes or an email thread. AI pulls out tasks with owners and due dates, decisions, risks and open questions.",
    highlight: true,
  },
  {
    icon: "chart",
    title: "AI status reports",
    body: "One click turns live task data into a stakeholder-ready update: health, highlights, concerns and next steps.",
    highlight: true,
  },
  {
    icon: "sheet",
    title: "Table view",
    body: "A spreadsheet that works for you: color-coded statuses, owners, priorities and dates, all editable in place.",
  },
  {
    icon: "board",
    title: "Board view",
    body: "Drag cards across To do, Working on it, Stuck and Done, or group the board by section.",
  },
  {
    icon: "calendar",
    title: "Calendar view",
    body: "See every deadline on a month grid, and drag tasks to a new day to reschedule them.",
  },
  {
    icon: "timeline",
    title: "Timeline view",
    body: "A Gantt chart of your schedule. Drag bars to move work and stretch them to change durations.",
  },
  {
    icon: "check",
    title: "My work",
    body: "Every task across every project in one list: overdue, today, this week and later.",
  },
  {
    icon: "gavel",
    title: "Decisions & risks",
    body: "A searchable log of what was decided and why, plus open risks and questions, so nothing gets re-argued.",
  },
];

export default function Features() {
  return (
    <Section
      id="features"
      eyebrow="Features"
      title="Everything your team needs to plan and deliver"
      intro="Five ways to see every project, subtasks and updates on every task, and AI that handles the busywork."
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
