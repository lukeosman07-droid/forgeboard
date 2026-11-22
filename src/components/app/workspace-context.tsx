"use client";

import { createContext, use, useCallback, useEffect, useMemo } from "react";
import { rememberWorkspace } from "@/server/members";
import type { PlanState } from "@/lib/plans";
import type { Person, Role, WorkspacePlan } from "@/lib/types";

// The workspace the current page belongs to, for client components: who is in
// it, what the viewer may do, and how to build links inside it.
// These flags only shape the UI. The database enforces the real permissions.

export type WorkspaceInfo = {
  id: string;
  slug: string;
  name: string;
  plan: WorkspacePlan;
  userId: string;
  role: Role;
  /** Owner, admin or member, while the workspace isn't read-only. Guests can only read and comment. */
  canEdit: boolean;
  /** Plan limits, usage and read-only state. */
  limits: PlanState;
  /** Owner or admin. */
  isAdmin: boolean;
  people: Person[];
};

const WorkspaceContext = createContext<WorkspaceInfo | null>(null);

export function WorkspaceProvider({
  value,
  rememberAsLast,
  children,
}: {
  value: WorkspaceInfo;
  /** True when this isn't the workspace saved as the user's last one. */
  rememberAsLast: boolean;
  children: React.ReactNode;
}) {
  // So that /dashboard and the next login open the workspace used most recently.
  useEffect(() => {
    if (rememberAsLast) void rememberWorkspace(value.id);
  }, [rememberAsLast, value.id]);

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace() {
  const workspace = use(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used inside a workspace page");
  return workspace;
}

/** Path of the workspace home, e.g. "/w/acme". */
export function workspacePath(slug: string, path = "") {
  return `/w/${slug}${path}`;
}

/** Builds links inside the current workspace: path("/my-work") -> "/w/acme/my-work". */
export function useWorkspacePath() {
  const { slug } = useWorkspace();
  return useCallback((path = "") => workspacePath(slug, path), [slug]);
}

/** The workspace's people, with a quick lookup by user ID. */
export function usePeople() {
  const { people } = useWorkspace();
  return useMemo(() => ({ people, byId: new Map(people.map((p) => [p.user_id, p])) }), [people]);
}
