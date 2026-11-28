import type { ReactNode } from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/plans";
import { CapturePreview, ReviewPreview, RfiLogPreview, SubmittalPreview, TimelinePreview, WorkloadPreview } from "./previews";

// The landing page. Everything here describes what the product does today:
// see docs/CHANGELOG.md for the source of each claim.

const container = "mx-auto max-w-6xl px-4 sm:px-6";
const primaryCta =
  "inline-flex items-center justify-center rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400";
const secondaryCta =
  "inline-flex items-center justify-center rounded-md border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.04]";

function Label({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.14em] text-slate-500">{children}</p>;
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="mt-[3px] h-4 w-4 shrink-0 text-orange-400" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function Hero() {
  return (
    <section id="top" className="relative border-b border-white/[0.06]">
      {/* A faint drawing-sheet grid, fading out below the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
      />
      <div className={`${container} relative pb-16 pt-14 sm:pb-24 sm:pt-20`}>
        <div className="max-w-4xl">
          <div className="fb-in">
            <Label>Project control for engineering and construction teams</Label>
          </div>
          <h1 className="fb-in mt-5 max-w-[22ch] [--d:1] text-balance text-[2.5rem] font-semibold leading-[1.06] tracking-[-0.02em] text-white sm:text-5xl lg:text-[3.75rem]">
            Every RFI, submittal and deadline on your projects, in one system.
          </h1>
          <p className="fb-in mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 [--d:2]">
            Forgeboard is project management built for engineering work. Tasks and schedules, RFI and submittal logs, design
            review comments, decisions and files live together and stay linked. Your firm works in it; clients and contractors
            see what you share.
          </p>
          <div className="fb-in mt-8 flex flex-col gap-3 sm:flex-row [--d:3]">
            <a href="/signup" className={primaryCta}>
              Start a {TRIAL_DAYS}-day trial
            </a>
            <a href="#workflows" className={secondaryCta}>
              See what it handles
            </a>
          </div>
          <ul className="fb-in mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500 [--d:4]">
            <li>No credit card</li>
            <li>One price per firm, not per seat</li>
            <li>Export everything, any time</li>
          </ul>
        </div>

        <div className="fb-in-window mt-12 sm:mt-14">
          <RfiLogPreview />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const MODULES = [
  { name: "Tasks & schedule", href: "#schedule" },
  { name: "RFI log", href: "#registers" },
  { name: "Submittal log", href: "#registers" },
  { name: "Design reviews", href: "#reviews" },
  { name: "Decisions & risks", href: "#reviews" },
  { name: "Workload", href: "#workload" },
  { name: "Files & documents", href: "#documents" },
  { name: "Weekly reports", href: "#workload" },
];

export function ModuleIndex() {
  return (
    <section id="product" aria-labelledby="modules-title" className="border-b border-white/[0.06]">
      <div className={`${container} py-10`}>
        <h2 id="modules-title" className="sr-only">
          What&apos;s included
        </h2>
        <ol className="fb-stagger grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
          {MODULES.map((m, i) => (
            <li key={m.name} className="bg-slate-950">
              <a href={m.href} className="flex h-full items-baseline gap-3 px-4 py-4 transition hover:bg-white/[0.03]">
                <span className="font-mono text-[11px] text-orange-400/80">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm font-medium text-slate-200">{m.name}</span>
              </a>
            </li>
          ))}
        </ol>
        <p className="fb-reveal mt-4 text-sm text-slate-500">They link to each other: an RFI to the task waiting on its answer, a submittal to its drawings. Which ones you get depends on your plan.</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const BREAKS = [
  {
    title: "The RFI log is one person's spreadsheet.",
    body: "Nobody else can see what's open, who has it, or how many days it has been waiting until someone asks in a meeting.",
  },
  {
    title: "A slipped date doesn't travel.",
    body: "Procurement moves a week. The install and cutover dates that depend on it stay where they were until someone notices on site.",
  },
  {
    title: "Review comments vanish between rounds.",
    body: "At 90% no one can say which 60% comments were incorporated, which were rejected, and who decided.",
  },
];

export function Problem() {
  return (
    <section aria-labelledby="problem-title" className="border-b border-white/[0.06]">
      <div className={`${container} grid grid-cols-1 gap-12 py-20 sm:py-24 lg:grid-cols-[2fr_3fr]`}>
        <div className="fb-reveal">
          <Label>The problem</Label>
          <h2 id="problem-title" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Project control usually lives in five places.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-400">
            A task tracker, an RFI spreadsheet, a submittal log, marked-up PDFs and an email thread. Each is right until the
            day it matters. Forgeboard keeps them in one place, so the RFI, the task waiting on its answer and the drawing it
            refers to stay together.
          </p>
        </div>
        <ul className="fb-stagger divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {BREAKS.map((b) => (
            <li key={b.title} className="py-6">
              <p className="text-lg font-medium text-white">{b.title}</p>
              <p className="mt-2 leading-relaxed text-slate-400">{b.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

type Workflow = {
  id: string;
  label: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    id: "registers",
    label: "01 · RFIs and submittals",
    title: "Registers that keep themselves current.",
    body: "Every RFI and submittal is numbered per project and carries its ball in court, its required date and a status the system timestamps. Days open is a recorded fact, not someone's estimate.",
    points: [
      "RFIs move from draft to open, answered and closed; an open question from a meeting becomes an RFI in two clicks",
      "Ball in court can be a teammate or an outside party, such as the utility or the contractor",
      "Submittal actions: approved, approved as noted, revise and resubmit, rejected, with every revision kept",
      "Overdue items flagged, follow-up tasks linked, drawings and cut sheets attached",
      "Export either log to CSV or a print-ready PDF for the project file",
    ],
    visual: <SubmittalPreview />,
  },
  {
    id: "schedule",
    label: "02 · Tasks and schedule",
    title: "A schedule that shows what a slip breaks.",
    body: "Plan the same work as a table, a board, a calendar or a timeline. Link the tasks that wait on each other, and when a date moves, every task it now clashes with is flagged on the spot.",
    points: [
      "Owners, priorities, start and due dates, subtasks and comments on every task",
      "Finish-to-start dependencies, with loops blocked",
      "Conflicts flagged in the table, on the timeline and in the task itself",
      "Milestones on the timeline; filters and sorting saved as named views anyone on the project can open from a link",
    ],
    visual: <TimelinePreview />,
  },
  {
    id: "reviews",
    label: "03 · Design reviews and decisions",
    title: "Design reviews that close cleanly.",
    body: "Log review comments against a milestone, give each an owner and record what was decided: incorporate, no change, rejected or deferred. A review can't be closed while a comment is undecided or an accepted change isn't done.",
    points: [
      "Comments marked “incorporate” become real tasks in the schedule and in workload",
      "A decision log records what was agreed and why, so it isn't argued again",
      "Risks carry a severity; open questions carry an owner",
      "Each task keeps a history of changes: who, what and when",
    ],
    visual: <ReviewPreview />,
  },
  {
    id: "workload",
    label: "04 · Workload and reporting",
    title: "See who is overloaded before the deadline does.",
    body: "The workload view counts every open task per person, per week, across all of your firm's projects, with overdue work called out. Project managers can have a weekly status report emailed every Monday, with a read-only link to share.",
    points: [
      "Four to twelve weeks ahead, plus overdue and undated work",
      "My work: every assignment across projects, sorted into overdue, today, this week and later",
      "Each project's overview shows progress, overdue tasks and recent activity",
      "Shared report links expire after 30 days and can be revoked any time",
    ],
    visual: <WorkloadPreview />,
  },
];

export function Workflows() {
  return (
    <section id="workflows" aria-labelledby="workflows-title">
      <div className={`fb-reveal ${container} pt-20 sm:pt-28`}>
        <Label>What it handles</Label>
        <h2 id="workflows-title" className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Four workflows every engineering project runs on.
        </h2>
      </div>
      {WORKFLOWS.map((w, i) => (
        <article key={w.id} id={w.id} className="border-b border-white/[0.06]">
          <div className={`${container} grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16`}>
            <div className={`fb-reveal min-w-0 ${i % 2 ? "lg:order-2" : ""}`}>
              <p className="font-mono text-xs text-orange-400/90">{w.label}</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{w.title}</h3>
              <p className="mt-4 leading-relaxed text-slate-400">{w.body}</p>
              <ul className="fb-stagger mt-6 space-y-3">
                {w.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-slate-300">
                    <Check />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`fb-window min-w-0 ${i % 2 ? "lg:order-1" : ""}`}>{w.visual}</div>
          </div>
        </article>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------

const TEAM = [
  { title: "Clients and contractors are free", body: "Share a project with people outside your firm. Guests see only what you share, can comment, and don't take a seat." },
  { title: "Roles that match a firm", body: "Owners, admins, members and guests, with access checked on every request." },
  { title: "Comments and @mentions", body: "Discuss a task where the work is. Mentions notify in the app and by email, with an optional daily digest." },
  { title: "Live for everyone", body: "Changes appear for everyone on the project in about a second, and you can see who else has it open." },
  { title: "Search across everything", body: "Ctrl K finds tasks, comments, RFIs, submittals and documents across every project you can see." },
  { title: "Templates for the work you repeat", body: "Start from MEP design, structural design, site and civil, or product introduction, or save one of your own projects as a template." },
];

export function Team() {
  return (
    <section id="team" aria-labelledby="team-title" className="border-b border-white/[0.06]">
      <div className={`${container} py-20 sm:py-28`}>
        <div className="fb-reveal max-w-2xl">
          <Label>For the whole project team</Label>
          <h2 id="team-title" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Built for the people inside your firm, and the ones outside it.
          </h2>
        </div>
        <dl className="fb-stagger mt-12 grid gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((t) => (
            <div key={t.title} className="bg-slate-950 p-6">
              <dt className="font-medium text-white">{t.title}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-slate-400">{t.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function Documents() {
  return (
    <section id="documents" aria-labelledby="documents-title" className="border-b border-white/[0.06]">
      <div className={`${container} grid grid-cols-1 items-center gap-10 py-20 sm:py-24 lg:grid-cols-[2fr_3fr] lg:gap-14`}>
        <div className="fb-reveal min-w-0">
          <Label>Files and documents</Label>
          <h2 id="documents-title" className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Minutes in. Tracked work out.
          </h2>
          <p className="mt-5 leading-relaxed text-slate-400">
            Attach drawings, specs and cut sheets to tasks, RFIs and submittals. Upload meeting minutes as a PDF, Word file,
            saved email or transcript, and Forgeboard proposes the action items,
            decisions, risks and open questions it finds, each linked to the sentence and page it came from.
          </p>
          <p className="mt-4 leading-relaxed text-slate-400">
            Nothing is added until someone on your team ticks it. The same review-first rule applies to the optional drafting
            helpers: an RFI drafted from a highlighted passage, and a submittal checked against a pasted spec section.
          </p>
          <p className="mt-6 border-l-2 border-white/10 pl-4 text-sm leading-relaxed text-slate-500">
            Reading documents, the drafting helpers and the weekly report use an AI model from Anthropic. Your text is used to
            answer your request and isn&apos;t used to train models. Each of these counts against a monthly limit on your plan,
            so costs stay predictable.
          </p>
        </div>
        <div className="fb-window min-w-0">
          <CapturePreview />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const TRUST = [
  {
    title: "Access enforced in the database",
    body: "Each firm's data is separated by access rules on every table in the database itself, not only in the app's pages.",
  },
  {
    title: "Export everything, any time",
    body: "Export a project to CSV, the whole workspace to a ZIP, or a register to PDF. On every plan, even when read-only.",
  },
  {
    title: "Nothing is deleted for non-payment",
    body: "If a trial ends or a card fails, the workspace becomes read-only. Everything stays visible and exportable.",
  },
  {
    title: "Card details never touch our servers",
    body: "Payments run through Stripe. Plan changes are accepted only from Stripe messages whose signature is verified.",
  },
];

export function Trust() {
  return (
    <section id="security" aria-labelledby="trust-title" className="border-b border-white/[0.06]">
      <div className={`${container} py-20 sm:py-28`}>
        <div className="fb-reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <Label>Security and data</Label>
            <h2 id="trust-title" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your project record, protected and portable.
            </h2>
          </div>
          <Link href="/security" className="text-sm font-medium text-slate-300 underline decoration-white/20 underline-offset-4 hover:text-white">
            Read the security overview
          </Link>
        </div>
        <div className="fb-stagger mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.title} className="border-t border-white/10 pt-5">
              <p className="font-medium text-white">{t.title}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title">
      <div className={`${container} py-20 sm:py-24`}>
        <div className="fb-window flex flex-col items-start justify-between gap-8 rounded-xl border border-white/10 bg-white/[0.02] px-6 py-10 sm:px-10 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 id="cta-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Set up your next project in Forgeboard.
            </h2>
            <p className="mt-3 leading-relaxed text-slate-400">
              Every workspace starts with a sample project to explore, and a {TRIAL_DAYS}-day trial of every feature. No credit
              card needed.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a href="/signup" className={primaryCta}>
              Start a {TRIAL_DAYS}-day trial
            </a>
            <Link href="/contact" className={secondaryCta}>
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
