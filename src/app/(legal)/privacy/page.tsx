import type { Metadata } from "next";
import { contact, site } from "@/lib/site";
import { Bullets, EmailLink, LegalHeader, LegalSection } from "../legal-ui";

export const metadata: Metadata = { title: "Privacy Policy – Forgeboard" };

export default function PrivacyPage() {
  return (
    <article>
      <LegalHeader
        title="Privacy Policy"
        intro={`What ${site.name} collects, why, and who helps us process it. We don't sell your data and we don't show ads.`}
      />

      <LegalSection title="What we collect">
        <Bullets
          items={[
            <><strong className="text-white">Account details:</strong> your name, company name and email address.</>,
            <><strong className="text-white">Your content:</strong> the projects, tasks, notes, comments and other text you enter.</>,
            <><strong className="text-white">Billing details:</strong> your plan and subscription status. Card numbers go straight to Stripe; we never see or store them.</>,
            <><strong className="text-white">Usage records:</strong> when you use an AI feature, so we can apply plan limits.</>,
            <><strong className="text-white">Error reports:</strong> technical details of crashes, tagged with your account ID but not your name, email or content.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="How we use it">
        <Bullets
          items={[
            "To run the service: sign you in, store your work and show it back to you.",
            "To provide AI features: the text you submit is sent to our AI provider to produce the result.",
            "To bill you for a paid plan.",
            "To find and fix problems, and to keep the service secure.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Companies that process data for us">
        <Bullets
          items={[
            <><strong className="text-white">Supabase:</strong> database and sign-in.</>,
            <><strong className="text-white">Vercel:</strong> website hosting.</>,
            <><strong className="text-white">Stripe:</strong> payments and invoices.</>,
            <><strong className="text-white">Anthropic:</strong> AI processing of the text you submit to AI features.</>,
            <><strong className="text-white">Sentry:</strong> error monitoring.</>,
          ]}
        />
        <p>
          Whether text sent to the AI provider may be used to train models is governed by that provider&apos;s API terms.
          This statement will be confirmed against those terms before launch.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          We use only the cookies needed to keep you signed in. We don&apos;t use advertising or cross-site tracking
          cookies.
        </p>
      </LegalSection>

      <LegalSection title="Keeping and deleting data">
        <Bullets
          items={[
            "We keep your data for as long as your account exists.",
            "Deleting your account from Settings permanently removes your profile and all of your projects, tasks, notes and comments.",
            "Stripe keeps payment records for as long as tax and accounting law requires.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You can see and correct your profile in Settings, and delete your account there. To ask for a copy of your data
          or anything else about privacy, write to <EmailLink address={contact.support} />.
        </p>
        <p className="text-sm text-slate-500">Last updated: November 16, 2026.</p>
      </LegalSection>
    </article>
  );
}
