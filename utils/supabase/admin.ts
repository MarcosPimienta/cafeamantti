import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client (bypasses RLS). Server only: for what the public
 * checkout must read but customers can't (stock, coupons). null when the
 * key isn't configured.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
