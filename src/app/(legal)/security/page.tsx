import type { Metadata } from "next";
import { contact, site } from "@/lib/site";
import { Bullets, EmailLink, LegalHeader, LegalSection } from "../legal-ui";

export const metadata: Metadata = { title: "Security – Forgeboard" };

export default function SecurityPage() {
  return (
    <article>
      <LegalHeader
        title="Security"
        intro={`How ${site.name} protects your project data. This page describes what is in place today, not what is planned.`}
      />

      <LegalSection title="Your data is separated from everyone else's">
        <Bullets
          items={[
            "Access rules are enforced inside the database on every table (Postgres Row Level Security), not only in the app, so a bug in a page can't expose another account's data.",
            "Plans, billing status and AI usage can only be changed by our server, never from a browser.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Sign-in">
        <Bullets
          items={[
            "Passwords are hashed by our sign-in provider (Supabase Auth); we never store or see them in plain text.",
            "Changing or resetting your password signs you out on every other device.",
            "Changing your email needs your current password and a confirmation link.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Payments">
        <Bullets
          items={[
            "Card details are entered on Stripe's pages and never touch our servers.",
            "Plan changes are accepted only from Stripe messages whose signature we verify.",
          ]}
        />
      </LegalSection>

      <LegalSection title="AI">
        <Bullets
          items={[
            "Text you submit is treated as data, never as instructions to the AI.",
            "The AI can only suggest. Nothing is saved until you review and accept it.",
          ]}
        />
      </LegalSection>

      <LegalSection title="In transit and in the browser">
        <Bullets
          items={[
            "All traffic uses HTTPS.",
            "Security headers restrict what the site may load and stop it from being embedded in other sites.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Report a vulnerability">
        <p>
          If you find a security problem, please tell us at <EmailLink address={contact.security ?? contact.support} /> and
          give us a reasonable time to fix it before sharing it publicly. We won&apos;t take action against good-faith
          research.
        </p>
        <p className="text-sm text-slate-500">Last updated: November 16, 2026.</p>
      </LegalSection>
    </article>
  );
}
