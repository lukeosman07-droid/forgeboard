import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv, MISSING_ENV_MESSAGE } from "./env";

// Supabase client for Client Components (runs in the browser).
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error(MISSING_ENV_MESSAGE);
  return createBrowserClient(env.url, env.anonKey);
}
