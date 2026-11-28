// Row shapes for the tables in supabase/migrations.

/** The plan column on profiles: unused since Phase 2 (billing is on the workspace). */
export type Plan = "free" | "team" | "business" | "enterprise";
export type ItemType = "action_item" | "decision" | "risk" | "question";
export type ItemStatus = "open" | "in_progress" | "stuck" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ProjectColor = "orange" | "blue" | "green" | "purple" | "pink" | "teal" | "yellow" | "red";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  plan: Plan;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  ai_extractions_used: number;
  avatar_url: string | null;
  time_zone: string | null;
  last_workspace_id: string | null;
  created_at: string;
};

export type WorkspacePlan = "trial" | "starter" | "team" | "business" | "enterprise";
export type Role = "owner" | "admin" | "member" | "guest";

/** The columns of public.workspaces that members are allowed to read. */
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  subscription_status: string | null;
  trial_ends_at: string;
  /** Set when a payment fails; the workspace turns read-only once it passes. */
  grace_ends_at: string | null;
  billing_interval: "month" | "year" | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  storage_bytes_used: number;
  /** Null until the first-run steps are done (new workspaces only). */
  onboarded_at: string | null;
  checklist_dismissed_at: string | null;
  created_at: string;
};

/** A person in a workspace, from the workspace_people() database function. */
export type Person = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: Role;
  joined_at: string;
};

export type Invite = {
  id: string;
  workspace_id: string;
  email: string;
  role: Exclude<Role, "owner">;
  project_id: string | null;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type Project = {
  id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  /** The project's PM: with admins, the only one who can bring guests in. Null: admins only. */
  manager_id: string | null;
  name: string;
  description: string | null;
  color: ProjectColor;
  created_at: string;
};

export type Section = {
  id: string;
  project_id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  name: string;
  position: number;
  created_at: string;
};

export type DocumentOrigin = "paste" | "upload" | "email";

/** Text the AI reads: pasted notes, an uploaded file's text, or a forwarded email. */
export type ProjectDocument = {
  id: string;
  project_id: string;
  workspace_id: string;
  /** Who made the row (for email, the sender if they're a member). It does not control access. */
  created_by: string | null;
  title: string | null;
  origin: DocumentOrigin;
  raw_text: string;
  summary: string | null;
  /** For a PDF: where each page starts in raw_text. */
  page_offsets: number[] | null;
  attachment_id: string | null;
  email_from: string | null;
  captured_at: string | null;
  created_at: string;
};

/** A file on a task or document, kept in private storage. */
export type Attachment = {
  id: string;
  project_id: string;
  workspace_id: string;
  item_id: string | null;
  document_id: string | null;
  rfi_id?: string | null;
  submittal_id?: string | null;
  storage_path: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  status: "pending" | "ready";
  created_by: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  project_id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  /** The document this came from (AI capture), with the words and page it came from. */
  source_document_id: string | null;
  source_quote: string | null;
  source_page: number | null;
  section_id: string | null;
  type: ItemType;
  title: string;
  details: string | null;
  /** Display name of the owner. For a member it is kept in step with assignee_id. */
  assignee: string | null;
  /** The workspace member who owns the task, when the owner is a member. */
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  priority: Priority | null;
  status: ItemStatus;
  position: number;
  completed_at: string | null;
  created_at: string;
  /** Phase 5 register links (optional so older fixtures still type-check). */
  rfi_id?: string | null;
  submittal_id?: string | null;
  /** Set for a design review comment, along with its disposition. */
  review_id?: string | null;
  disposition?: "pending" | "incorporate" | "no_change" | "rejected" | "deferred" | null;
};

export type Subtask = {
  id: string;
  item_id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
};

export type ItemComment = {
  id: string;
  item_id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  body: string;
  created_at: string;
  /** Set when the author edits it. */
  edited_at: string | null;
};

/** A task plus counts shown on cards and rows. */
export type Task = Item & { subtask_total: number; subtask_done: number; comment_count: number };

/** One line of a task's or project's history. Written by database triggers. */
export type Activity = {
  id: number;
  workspace_id: string;
  project_id: string;
  item_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  verb: "created" | "updated" | "deleted" | "commented" | "comment_edited" | "comment_deleted";
  item_title: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  created_at: string;
};

export type NotificationType = "assigned" | "mentioned" | "commented" | "status";

export type AppNotification = {
  id: number;
  workspace_id: string;
  project_id: string | null;
  item_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  type: NotificationType;
  data: { status?: string; old_status?: string };
  read_at: string | null;
  created_at: string;
};

export type NotificationPrefs = {
  in_app_assigned: boolean;
  in_app_mentioned: boolean;
  in_app_commented: boolean;
  in_app_status: boolean;
  email_assigned: boolean;
  email_mentioned: boolean;
  email_commented: boolean;
  email_status: boolean;
  email_digest: boolean;
  digest_hour: number;
};

/** Matches the database defaults used when someone has never saved preferences. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  in_app_assigned: true,
  in_app_mentioned: true,
  in_app_commented: true,
  in_app_status: true,
  email_assigned: true,
  email_mentioned: true,
  email_commented: false,
  email_status: false,
  email_digest: true,
  digest_hour: 8,
};
