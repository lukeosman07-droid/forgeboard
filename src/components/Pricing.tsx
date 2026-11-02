import Section from "./Section";
import Icon from "./Icon";

// Buttons are placeholders until Stripe checkout is added.
const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "For trying Forgeboard on a single project.",
    features: ["1 project", "10 AI extractions per month", "Decision log & requirements", "Up to 3 team members"],
    cta: "Get started free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "per user / month",
    blurb: "For teams running real engineering projects.",
    features: [
      "Unlimited projects",
      "Unlimited AI extractions",
      "Unlimited team members",
      "File organization & attachments",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    featured: true,
  },
];

export default function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Simple pricing that scales with your team"
      intro="Start free. Upgrade when your team is ready."
    >
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              plan.featured ? "border-orange-500/60 bg-slate-900 shadow-xl shadow-orange-500/10" : "border-white/10 bg-slate-900/60"
            }`}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-8 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950">
                Most popular
              </span>
            )}
            <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
            <p className="mt-1 text-slate-400">{plan.blurb}</p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight text-white">{plan.price}</span>
              <span className="text-slate-400">{plan.period}</span>
            </p>
            <ul className="mt-8 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-slate-300">
                  <Icon name="check" className="h-5 w-5 shrink-0 text-orange-400" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`mt-8 w-full rounded-lg px-4 py-3 font-semibold transition ${
                plan.featured
                  ? "bg-orange-500 text-slate-950 hover:bg-orange-400"
                  : "border border-white/15 text-white hover:bg-white/5"
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
