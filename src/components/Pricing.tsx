import Link from "next/link";
import PlanPicker from "./plan-picker";
import Section from "./Section";
import { GRACE_DAYS, PAID_PLANS, PLAN_LABELS, PLAN_LIMITS, TRIAL_DAYS, formatBytes, type PlanLimits } from "@/lib/plans";

// Pricing: plan cards with a monthly/annual switch. The landing page shows the
// cards; the /pricing page adds the full comparison table and the FAQ.

export default function Pricing({ full = false }: { full?: boolean }) {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="One price per firm, not per seat"
      intro={`Add the intern or the client's project manager without a new bill. Every workspace starts with a ${TRIAL_DAYS}-day trial of everything, no card needed.`}
      className="border-b border-white/[0.06]"
    >
      <PlanPicker />

      <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900/60 px-8 py-6 sm:flex-row">
        <div>
          <p className="text-lg font-semibold text-white">Enterprise</p>
          <p className="text-slate-400">More than 50 people, custom contract and invoicing, dedicated onboarding.</p>
        </div>
        <Link href="/contact" className="rounded-lg border border-white/15 px-5 py-2.5 font-semibold text-white hover:bg-white/5">
          Contact us
        </Link>
      </div>

      {full && (
        <>
          <Comparison />
          <Faq />
        </>
      )}
    </Section>
  );
}

const ROWS: { label: string; trial: string; value: (l: PlanLimits) => string }[] = [
  { label: "People (guests are free)", trial: String(PLAN_LIMITS.trial.seats), value: (l) => String(l.seats) },
  { label: "AI runs per month", trial: String(PLAN_LIMITS.trial.aiRuns), value: (l) => l.aiRuns.toLocaleString() },
  { label: "File storage", trial: formatBytes(PLAN_LIMITS.trial.storageBytes), value: (l) => formatBytes(l.storageBytes) },
  { label: "Tasks, decisions, risks and all views", trial: "Yes", value: () => "Yes" },
  { label: "File and email AI, project inbox, Ask Forgeboard", trial: "Yes", value: (l) => (l.file_ai ? "Yes" : "No") },
  { label: "RFI and submittal registers, dependencies", trial: "Yes", value: (l) => (l.registers ? "Yes" : "No") },
  { label: "Workload, custom templates, scheduled reports", trial: "Yes", value: (l) => (l.workload ? "Yes" : "No") },
  {
    label: "Activity history",
    trial: `${PLAN_LIMITS.trial.activityDays} days`,
    value: (l) => (l.activityDays === null ? "Unlimited" : l.activityDays >= 365 ? "1 year" : `${l.activityDays} days`),
  },
];

function Comparison() {
  return (
    <div className="mx-auto mt-16 max-w-6xl">
      <h3 className="text-center text-2xl font-semibold text-white">Compare plans</h3>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Feature</span>
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Trial ({TRIAL_DAYS} days)
              </th>
              {PAID_PLANS.map((plan) => (
                <th key={plan} scope="col" className="px-4 py-3 font-medium">
                  {PLAN_LABELS[plan]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-4 py-3 font-normal text-slate-300">
                  {row.label}
                </th>
                <td className="px-4 py-3 text-white">{row.trial}</td>
                {PAID_PLANS.map((plan) => {
                  const value = row.value(PLAN_LIMITS[plan]);
                  return (
                    <td key={plan} className={`px-4 py-3 ${value === "No" ? "text-slate-500" : "text-white"}`}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "What counts as a seat?",
    a: "Everyone in your firm who creates or edits work: owners, admins and members. Guests (clients, contractors, consultants you share a project with) are free and unlimited. They see only the projects you share and can read and comment.",
  },
  {
    q: "What happens after the trial?",
    a: `You get ${TRIAL_DAYS} days of everything, no card needed. If nobody subscribes by the end, the workspace becomes read-only: everything stays visible and exportable, and nothing is deleted. Choose a plan any time to pick up where you left off.`,
  },
  {
    q: "What if a payment fails?",
    a: `Nothing stops right away. The owner gets an email and a banner, and the workspace keeps working for ${GRACE_DAYS} days while the card is updated. After that it becomes read-only until the payment goes through. We never delete data for non-payment.`,
  },
  {
    q: "Can I export my data?",
    a: "Yes, at any time and on every plan, even when read-only. Export one project to CSV, or the whole workspace to a ZIP of CSV files.",
  },
  {
    q: "Where is my data stored?",
    a: "In a Postgres database run by Supabase, encrypted at rest and in transit. Row Level Security in the database keeps each firm's data separate from every other firm's. See the Security page for details.",
  },
  {
    q: "Is my data used to train AI?",
    a: "We don't use your data to train AI models. AI features send the text you choose to Anthropic's API; under Anthropic's commercial terms, API data isn't used to train their models by default. See the Privacy page for details.",
  },
  {
    q: "Can I switch plans or cancel?",
    a: "Yes. The owner can switch plans or between monthly and annual from the Billing page; changes are prorated. Cancel from the billing portal and the plan runs to the end of the period you paid for.",
  },
];

function Faq() {
  return (
    <div className="mx-auto mt-16 max-w-3xl">
      <h3 className="text-center text-2xl font-semibold text-white">Questions</h3>
      <div className="mt-6 divide-y divide-white/10 rounded-2xl border border-white/10 bg-slate-900/60">
        {FAQ.map((item) => (
          <details key={item.q} className="group px-6 py-4">
            <summary className="cursor-pointer list-none font-medium text-white marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {item.q}
                <span aria-hidden className="text-slate-500 transition group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-slate-400">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
