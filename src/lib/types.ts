// Row shapes for the tables in supabase/migrations.

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

export type Note = {
  id: string;
  project_id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  raw_text: string;
  summary: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  project_id: string;
  workspace_id: string;
  /** Who made the row. Null once that account is deleted. It does not control access. */
  created_by: string | null;
  note_id: string | null;
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
};

/** A task plus counts shown on cards and rows. */
export type Task = Item & { subtask_total: number; subtask_done: number; comment_count: number };
