import Section from "./Section";
import Icon from "./Icon";
import { FREE_TRIAL_EXTRACTIONS } from "@/lib/plans";
import { checkoutPath } from "@/lib/safe-next";
import { site } from "@/lib/site";

// Team and Business go to Stripe Checkout (via sign-up first if logged out).
// Plain <a> tags, not <Link>, so checkout pages are never prefetched in the background.
const plans = [
  {
    name: "Team",
    price: "$299",
    period: "/ month",
    blurb: "Per company, for teams of up to 15 people.",
    features: [
      "Up to 15 users",
      "Unlimited projects",
      "AI meeting-notes extraction",
      "Decision log, risks & action items",
      "Email support",
    ],
    cta: "Get Team",
    href: checkoutPath("team"),
    featured: false,
  },
  {
    name: "Business",
    price: "$799",
    period: "/ month",
    blurb: "Per company, for growing engineering orgs.",
    features: [
      "Up to 50 users",
      "Everything in Team",
      "Priority AI processing",
      "File organization & attachments",
      "Priority support",
    ],
    cta: "Get Business",
    href: checkoutPath("business"),
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Contact us",
    period: "",
    blurb: "For large organizations with custom needs.",
    features: [
      "More than 50 users",
      "Everything in Business",
      "Dedicated onboarding",
      "Custom contract & invoicing",
    ],
    cta: "Contact us",
    href: `mailto:${site.salesEmail}?subject=${encodeURIComponent("Forgeboard Enterprise")}`,
    featured: false,
  },
];

export default function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Simple pricing that scales with your team"
      intro={`One price per company, not per seat. Every new account starts with a free trial of ${FREE_TRIAL_EXTRACTIONS} AI extractions.`}
    >
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
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
              <span className={`font-bold tracking-tight text-white ${plan.period ? "text-5xl" : "text-4xl"}`}>
                {plan.price}
              </span>
              {plan.period && <span className="text-slate-400">{plan.period}</span>}
            </p>
            <ul className="mt-8 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-slate-300">
                  <Icon name="check" className="h-5 w-5 shrink-0 text-orange-400" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={plan.href}
              className={`mt-8 block w-full rounded-lg px-4 py-3 text-center font-semibold transition ${
                plan.featured
                  ? "bg-orange-500 text-slate-950 hover:bg-orange-400"
                  : "border border-white/15 text-white hover:bg-white/5"
              }`}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>
    </Section>
  );
}
