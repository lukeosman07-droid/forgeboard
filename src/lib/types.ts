// Row shapes for the tables in supabase/migrations.

export type Plan = "free" | "team" | "business" | "enterprise";
export type ItemType = "action_item" | "decision" | "risk" | "question";
export type ItemStatus = "open" | "done";
export type Priority = "low" | "medium" | "high";

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
  created_at: string;
};

export type Note = {
  id: string;
  project_id: string;
  owner_id: string;
  raw_text: string;
  created_at: string;
};

export type Item = {
  id: string;
  project_id: string;
  owner_id: string;
  note_id: string | null;
  type: ItemType;
  title: string;
  details: string | null;
  assignee: string | null;
  due_date: string | null;
  priority: Priority | null;
  status: ItemStatus;
  created_at: string;
};

// Free accounts get this many AI extractions to try the product.
export const FREE_TRIAL_EXTRACTIONS = 3;
