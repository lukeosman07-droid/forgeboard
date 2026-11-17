// Account rules shared by the forms (hints) and the server (enforcement).

/** Shortest password accepted when a password is created or changed. */
export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message if the password can't be used, otherwise null. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 72) return "Your password can be at most 72 characters.";
  if (confirm !== undefined && password !== confirm) return "The two passwords don't match.";
  return null;
}

/**
 * The shared demo login. Its email, password and existence are locked so one
 * visitor can't lock everyone else out. Set DEMO_EMAIL to change which account it is.
 */
export function isDemoAccount(email: string | null | undefined) {
  return !!email && email.toLowerCase() === (process.env.DEMO_EMAIL ?? "demo@demo.com").toLowerCase();
}

/** The site's public address, without a trailing slash. Used in email links. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
