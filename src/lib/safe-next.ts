// Where to send someone after they log in or sign up (?next=...).
// Only same-site paths are allowed, so a link can't bounce users to another website.
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

/** The URL that starts checkout for a plan. Plain <a> links only (never prefetched). */
export function checkoutPath(plan: "team" | "business") {
  return `/api/checkout?plan=${plan}`;
}
