import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

// Returns the signed-in user, or null. Verifies the session token.
// Wrapped in cache() so several components in one request share one lookup.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
