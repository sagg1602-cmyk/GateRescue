import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "../env";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the secret key, which bypasses RLS.
 * Every table has RLS enabled with no policies, so the browser (anon /
 * publishable key) cannot read or write anything; all access goes through
 * the authenticated route handlers.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const env = getSupabaseEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
