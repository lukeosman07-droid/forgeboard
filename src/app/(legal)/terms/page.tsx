import type { Metadata } from "next";
import Link from "next/link";
import { contact, site } from "@/lib/site";
import { Bullets, EmailLink, LegalHeader, LegalSection } from "../legal-ui";

export const metadata: Metadata = { title: "Terms of Service – Forgeboard" };

export default function TermsPage() {
  return (
    <article>
      <LegalHeader
        title="Terms of Service"
        intro={`The rules for using ${site.name}. In short: your data is yours, pay for what you subscribe to, and don't misuse the service.`}
      />

      <LegalSection title="1. The service">
        <p>
          {site.name} is a web application for planning and tracking engineering projects. It includes AI features that
          suggest tasks, decisions, risks and status reports from text you provide.
        </p>
      </LegalSection>

      <LegalSection title="2. Your account">
        <Bullets
          items={[
            "You must give a real email address and keep your password private.",
            "You are responsible for what happens under your account.",
            "You can delete your account at any time from Settings. Deletion is permanent.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Your content">
        <p>
          You own the projects, notes, tasks and other content you put into {site.name}. You give us permission to store
          and process it only so we can run the service for you. See the <Link href="/privacy" className="text-orange-400 hover:text-orange-300">Privacy Policy</Link> for
          the companies that process it on our behalf.
        </p>
      </LegalSection>

      <LegalSection title="4. AI features">
        <Bullets
          items={[
            "AI output is a suggestion. Review it before you rely on it; it can be wrong or incomplete.",
            "Nothing the AI suggests is saved to a project until you accept it.",
            `${site.name} is not a substitute for professional engineering judgment, review or sign-off.`,
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Plans and payment">
        <Bullets
          items={[
            "Paid plans are billed in advance each month through Stripe, per company, at the price shown when you subscribe.",
            "You can cancel at any time from the Billing page. Your plan stays active until the end of the period you paid for.",
            "We may change prices for future billing periods and will tell you before we do.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>Do not use {site.name} to:</p>
        <Bullets
          items={[
            "break the law or infringe someone else's rights;",
            "upload malware or try to access other customers' data;",
            "overload, probe or reverse engineer the service;",
            "resell access without our written agreement.",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Availability and liability">
        <p>
          We work to keep {site.name} available and your data safe, but the service is provided &quot;as is&quot; without
          warranties. To the extent the law allows, our total liability is limited to the amount you paid us in the
          twelve months before the claim.
        </p>
      </LegalSection>

      <LegalSection title="8. Ending the agreement">
        <p>
          You can stop using {site.name} at any time. We may suspend or close an account that breaks these terms. If we
          close the service, we will give you reasonable notice and a way to export your data.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes and contact">
        <p>
          We will post changes to these terms on this page and update the date below. Questions:{" "}
          <EmailLink address={contact.support} />.
        </p>
        <p className="text-sm text-slate-500">Last updated: November 16, 2026.</p>
      </LegalSection>
    </article>
  );
}
