import { daysBetween } from "./work";

// Engineering registers (Phase 5): RFIs, submittals, milestones and design
// reviews. Row shapes match supabase/migrations/20261130000000_engineering.sql.

export type RfiStatus = "draft" | "open" | "answered" | "closed";
export type SubmittalAction = "pending" | "approved" | "approved_as_noted" | "revise_resubmit" | "rejected";
export type Disposition = "pending" | "incorporate" | "no_change" | "rejected" | "deferred";

export type Rfi = {
  id: string;
  workspace_id: string;
  project_id: string;
  number: number;
  subject: string;
  question: string;
  response: string | null;
  status: RfiStatus;
  asked_by_id: string | null;
  ball_in_court: string | null;
  ball_in_court_id: string | null;
  date_required: string | null;
  opened_at: string | null;
  answered_at: string | null;
  closed_at: string | null;
  source_item_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Submittal = {
  id: string;
  workspace_id: string;
  project_id: string;
  number: number;
  spec_section: string | null;
  title: string;
  description: string | null;
  submitted_by: string | null;
  reviewer: string | null;
  reviewer_id: string | null;
  received_on: string | null;
  due_on: string | null;
  returned_on: string | null;
  revision: number;
  action: SubmittalAction;
  review_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SubmittalRevision = {
  id: number;
  submittal_id: string;
  revision: number;
  action: SubmittalAction;
  received_on: string | null;
  due_on: string | null;
  returned_on: string | null;
  review_notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
};

export type Milestone = {
  id: string;
  project_id: string;
  number: number;
  name: string;
  due_on: string;
  done_at: string | null;
  created_at: string;
};

export type Review = {
  id: string;
  project_id: string;
  number: number;
  name: string;
  milestone_id: string | null;
  due_on: string | null;
  status: "open" | "closed";
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
};

export type Dependency = { id: string; predecessor_id: string; successor_id: string };

export type SavedView = {
  id: string;
  project_id: string;
  name: string;
  view: "table" | "board" | "calendar" | "timeline";
  query: string;
  shared: boolean;
  created_by: string | null;
  created_at: string;
};

export type CustomTemplate = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  plan: { sections: { name: string; tasks: { title: string; start_offset?: number | null; duration_days?: number | null; priority?: string | null; details?: string | null }[] }[] };
  created_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const RFI_STATUSES: { id: RfiStatus; label: string; pill: string }[] = [
  { id: "draft", label: "Draft", pill: "bg-slate-600 text-white" },
  { id: "open", label: "Open", pill: "bg-amber-500 text-slate-950" },
  { id: "answered", label: "Answered", pill: "bg-sky-500 text-slate-950" },
  { id: "closed", label: "Closed", pill: "bg-emerald-500 text-slate-950" },
];
export const RFI_STATUS = Object.fromEntries(RFI_STATUSES.map((s) => [s.id, s])) as Record<RfiStatus, (typeof RFI_STATUSES)[number]>;

export const SUBMITTAL_ACTIONS: { id: SubmittalAction; label: string; short: string; pill: string }[] = [
  { id: "pending", label: "Under review", short: "Pending", pill: "bg-slate-600 text-white" },
  { id: "approved", label: "Approved", short: "Approved", pill: "bg-emerald-500 text-slate-950" },
  { id: "approved_as_noted", label: "Approved as noted", short: "Approved as noted", pill: "bg-teal-400 text-slate-950" },
  { id: "revise_resubmit", label: "Revise and resubmit", short: "Revise & resubmit", pill: "bg-amber-500 text-slate-950" },
  { id: "rejected", label: "Rejected", short: "Rejected", pill: "bg-rose-500 text-white" },
];
export const SUBMITTAL_ACTION = Object.fromEntries(SUBMITTAL_ACTIONS.map((a) => [a.id, a])) as Record<
  SubmittalAction,
  (typeof SUBMITTAL_ACTIONS)[number]
>;

export const DISPOSITIONS: { id: Disposition; label: string; pill: string }[] = [
  { id: "pending", label: "Needs disposition", pill: "bg-slate-600 text-white" },
  { id: "incorporate", label: "Incorporate", pill: "bg-sky-500 text-slate-950" },
  { id: "no_change", label: "Noted, no change", pill: "bg-emerald-500 text-slate-950" },
  { id: "rejected", label: "Rejected", pill: "bg-rose-500 text-white" },
  { id: "deferred", label: "Deferred", pill: "bg-violet-500 text-white" },
];
export const DISPOSITION = Object.fromEntries(DISPOSITIONS.map((d) => [d.id, d])) as Record<Disposition, (typeof DISPOSITIONS)[number]>;

/** "RFI-007" */
export function rfiNumber(n: number) {
  return `RFI-${String(n).padStart(3, "0")}`;
}

/** "S-012", or "S-012 Rev 1" */
export function submittalNumber(n: number, revision = 0) {
  return `S-${String(n).padStart(3, "0")}${revision > 0 ? ` Rev ${revision}` : ""}`;
}

// ---------------------------------------------------------------------------
// RFI clock
// ---------------------------------------------------------------------------

/** The local date (YYYY-MM-DD) of a timestamp, in UTC like other plain dates here. */
function dayOf(ts: string) {
  return ts.slice(0, 10);
}

/**
 * Whole days an RFI has been open: from the day it was opened until it was
 * answered (the ball came back) or closed, or until today. Drafts: null.
 */
export function daysOpen(rfi: Pick<Rfi, "status" | "opened_at" | "answered_at" | "closed_at">, today: string): number | null {
  if (rfi.status === "draft" || !rfi.opened_at) return null;
  const end = rfi.answered_at ?? rfi.closed_at;
  return Math.max(0, daysBetween(dayOf(rfi.opened_at), end ? dayOf(end) : today));
}

/** Still waiting for an answer and past the date it was needed by. */
export function rfiOverdue(rfi: Pick<Rfi, "status" | "date_required">, today: string | null) {
  return !!today && !!rfi.date_required && (rfi.status === "open" || rfi.status === "draft") && rfi.date_required < today;
}

export function submittalOverdue(s: Pick<Submittal, "action" | "due_on">, today: string | null) {
  return !!today && !!s.due_on && s.action === "pending" && s.due_on < today;
}

/** A submittal can start a new revision only after it was sent back. */
export function canResubmit(s: Pick<Submittal, "action">) {
  return s.action === "revise_resubmit" || s.action === "rejected";
}

// ---------------------------------------------------------------------------
// Logs for export (CSV and PDF share these rows)
// ---------------------------------------------------------------------------

export const RFI_LOG_COLUMNS = ["RFI", "Subject", "Status", "Ball in court", "Asked by", "Opened", "Required", "Answered", "Days open", "Question", "Response"];

export function rfiLogRow(rfi: Rfi, askedBy: string, today: string): string[] {
  const days = daysOpen(rfi, today);
  return [
    rfiNumber(rfi.number),
    rfi.subject,
    RFI_STATUS[rfi.status].label,
    rfi.ball_in_court ?? "",
    askedBy,
    rfi.opened_at ? dayOf(rfi.opened_at) : "",
    rfi.date_required ?? "",
    rfi.answered_at ? dayOf(rfi.answered_at) : "",
    days === null ? "" : String(days),
    rfi.question,
    rfi.response ?? "",
  ];
}

export const SUBMITTAL_LOG_COLUMNS = ["No.", "Rev", "Spec section", "Title", "From", "Reviewer", "Received", "Due", "Returned", "Action", "Review notes"];

export function submittalLogRow(s: Submittal): string[] {
  return [
    submittalNumber(s.number),
    String(s.revision),
    s.spec_section ?? "",
    s.title,
    s.submitted_by ?? "",
    s.reviewer ?? "",
    s.received_on ?? "",
    s.due_on ?? "",
    s.returned_on ?? "",
    SUBMITTAL_ACTION[s.action].label,
    s.review_notes ?? "",
  ];
}
