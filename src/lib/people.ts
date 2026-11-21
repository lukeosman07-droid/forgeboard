import type { Person, Role } from "./types";

// Helpers for the people in a workspace. Plain functions, shared by the server
// (matching AI-extracted names to members) and the UI (pickers, labels).

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

export const ROLE_HELP: Record<Role, string> = {
  owner: "Billing, deleting the workspace, and everything an admin can do.",
  admin: "Manage members and settings, and edit all work.",
  member: "Create and edit work in every project.",
  guest: "Read and comment only, in the projects shared with them. Free.",
};

/** Roles that count toward the plan's seats. Guests are free. */
export function usesSeat(role: Role) {
  return role !== "guest";
}

/** May create and edit work. Guests may only read and comment. */
export function canEdit(role: Role | null | undefined) {
  return role === "owner" || role === "admin" || role === "member";
}

export function isAdmin(role: Role | null | undefined) {
  return role === "owner" || role === "admin";
}

/** What to call someone: their name, or the part of their email before the @. */
export function displayName(person: Pick<Person, "full_name" | "email">) {
  return person.full_name?.trim() || person.email?.split("@")[0] || "Unnamed";
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Finds the member a free-text name refers to, e.g. a name the AI read in
 * meeting notes. Matches a full email, a full name, or a first name that only
 * one person has. Returns null when nobody matches or the match is ambiguous,
 * so a wrong person is never assigned by guesswork.
 */
export function matchPerson<P extends Pick<Person, "user_id" | "full_name" | "email">>(name: string | null | undefined, people: P[]): P | null {
  const wanted = normalize(name ?? "");
  if (!wanted || wanted === "unassigned") return null;

  const byEmail = people.filter((p) => p.email && normalize(p.email) === wanted);
  if (byEmail.length === 1) return byEmail[0];

  const byFullName = people.filter((p) => p.full_name && normalize(p.full_name) === wanted);
  if (byFullName.length === 1) return byFullName[0];
  if (byFullName.length > 1) return null;

  const byFirstName = people.filter((p) => p.full_name && normalize(p.full_name).split(" ")[0] === wanted);
  return byFirstName.length === 1 ? byFirstName[0] : null;
}

/**
 * Shows each member-assigned task under that member's current name, so a
 * renamed person doesn't leave stale names behind.
 */
export function withCurrentNames<T extends { assignee: string | null; assignee_id: string | null }>(tasks: T[], people: Pick<Person, "user_id" | "full_name" | "email">[]): T[] {
  if (people.length === 0) return tasks;
  const names = new Map(people.map((p) => [p.user_id, displayName(p)]));
  return tasks.map((t) => {
    const name = t.assignee_id ? names.get(t.assignee_id) : undefined;
    return name && name !== t.assignee ? { ...t, assignee: name } : t;
  });
}
