// Reads the public Supabase settings from environment variables.
// Returns null when they're missing so the landing page still works before setup.
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const MISSING_ENV_MESSAGE =
  "Supabase isn't connected yet. Add your keys to .env.local (see .env.example) and restart the dev server.";
