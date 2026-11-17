import type { Metadata } from "next";
import { contact, site } from "@/lib/site";
import { EmailLink, LegalHeader } from "../legal-ui";

export const metadata: Metadata = { title: "Contact – Forgeboard" };

const CHANNELS = [
  {
    title: "Sales",
    text: "Enterprise plans, more than 50 users, custom contracts and invoicing.",
    address: contact.sales,
  },
  {
    title: "Support",
    text: "Help with your account, billing, or something that isn't working.",
    address: contact.support,
  },
  {
    title: "Security",
    text: "Report a vulnerability or ask about how we protect your data.",
    address: contact.security,
  },
];

export default function ContactPage() {
  return (
    <article>
      <LegalHeader title="Contact" intro={`How to reach the ${site.name} team.`} draft={false} />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <section key={c.title} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">{c.title}</h2>
            <p className="mt-2 text-sm text-slate-400">{c.text}</p>
            <p className="mt-4 break-words text-sm">
              <EmailLink address={c.address} fallback="Address coming soon" />
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
