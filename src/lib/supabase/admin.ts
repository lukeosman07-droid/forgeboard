import "server-only";
import { createClient } from "@supabase/supabase-js";

// Supabase client with the service role key. It BYPASSES Row Level Security,
// so only use it on the server, and only for things users must not do themselves
// (like checking and recording AI usage limits). Returns null if not configured.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
