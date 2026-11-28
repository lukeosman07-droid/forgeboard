"use client";

import { createContext, use } from "react";
import type { Dependency, Milestone, Review, Rfi, SavedView, Submittal } from "@/lib/registers";
import type { Task } from "@/lib/types";

// Phase 5 data that a project page loads next to its tasks: registers,
// milestones and reviews, dependencies and saved views. The task panel reads
// it for the dependency and register sections; outside a project page (My
// work, for example) those sections simply don't show.

export type ProjectExtras = {
  projectId: string;
  rfis: Rfi[];
  submittals: Submittal[];
  milestones: Milestone[];
  reviews: Review[];
  /** Review comments (items with a review_id), including ones not yet incorporated. */
  reviewComments: Task[];
  dependencies: Dependency[];
  views: SavedView[];
  /** The plan includes RFIs, submittals and dependencies. */
  registers: boolean;
};

const ExtrasContext = createContext<ProjectExtras | null>(null);

export function ProjectExtrasProvider({ value, children }: { value: ProjectExtras; children: React.ReactNode }) {
  return <ExtrasContext value={value}>{children}</ExtrasContext>;
}

/** Null outside a project page. */
export function useProjectExtras() {
  return use(ExtrasContext);
}
