import type { NotificationType } from "./types";
import { STATUSES } from "./work";

// Words for notifications, shared by the bell, the Inbox and the emails.

export function statusLabel(status: string | undefined) {
  return STATUSES.find((s) => s.id === status)?.label ?? status ?? "a new status";
}

/** "Sam assigned you a task", "Sam mentioned you", ... */
export function notificationHeadline(type: NotificationType, actor: string | null, data: { status?: string } = {}) {
  const who = actor || "Someone";
  switch (type) {
    case "assigned":
      return `${who} assigned you a task`;
    case "mentioned":
      return `${who} mentioned you`;
    case "commented":
      return `${who} commented on your task`;
    case "status":
      return `${who} moved your task to ${statusLabel(data.status)}`;
  }
}

/** The link that opens a task's panel on its project page. */
export function taskPath(slug: string, projectId: string, itemId: string) {
  return `/w/${slug}/projects/${projectId}?task=${itemId}`;
}
