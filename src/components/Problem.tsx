import Section from "./Section";
import Icon, { type IconName } from "./Icon";

const pains: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "mail",
    title: "Buried in email and chat",
    body: "Critical details live in a thread from three weeks ago — and only one person remembers which one.",
  },
  {
    icon: "sheet",
    title: "Spreadsheets that drift",
    body: "Task trackers, requirement lists, and BOMs get copied and edited until nobody trusts which version is current.",
  },
  {
    icon: "question",
    title: "“What did we decide?”",
    body: "Meetings end without clear owners or due dates, so decisions get re-argued and action items quietly slip.",
  },
];

export default function Problem() {
  return (
    <Section
      eyebrow="The problem"
      title="Engineering work is scattered everywhere"
      intro="Your team's knowledge is split across email, spreadsheets, shared drives, chat, and meeting notes. Finding it costs hours every week."
      className="border-t border-white/5 bg-slate-900/40"
    >
      <div className="grid gap-6 md:grid-cols-3">
        {pains.map((p) => (
          <div key={p.title} className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-red-500/10 text-red-300">
              <Icon name={p.icon} />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-white">{p.title}</h3>
            <p className="mt-2 text-slate-400">{p.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
