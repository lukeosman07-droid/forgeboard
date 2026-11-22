// Where to send someone after they log in or sign up (?next=...).
// Only same-site paths are allowed, so a link can't bounce users to another website.
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

/**
 * The URL that starts checkout for a plan. Plain <a> links only (never prefetched).
 * Without a workspace, checkout uses the one the user opened last.
 */
export function checkoutPath(plan: "starter" | "team" | "business", interval: "month" | "year" = "month", workspace?: string) {
  const query = new URLSearchParams({ plan, interval });
  if (workspace) query.set("workspace", workspace);
  return `/api/checkout?${query}`;
}
