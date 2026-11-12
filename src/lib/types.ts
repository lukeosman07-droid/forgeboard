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
  created_at: string;
};

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  color: ProjectColor;
  created_at: string;
};

export type Section = {
  id: string;
  project_id: string;
  owner_id: string;
  name: string;
  position: number;
  created_at: string;
};

export type Note = {
  id: string;
  project_id: string;
  owner_id: string;
  raw_text: string;
  summary: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  project_id: string;
  owner_id: string;
  note_id: string | null;
  section_id: string | null;
  type: ItemType;
  title: string;
  details: string | null;
  assignee: string | null;
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
  owner_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
};

export type ItemComment = {
  id: string;
  item_id: string;
  owner_id: string;
  body: string;
  created_at: string;
};

/** A task plus counts shown on cards and rows. */
export type Task = Item & { subtask_total: number; subtask_done: number; comment_count: number };
