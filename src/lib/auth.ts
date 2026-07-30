import "server-only";
import { isDemoMode } from "@/lib/env";
import { getSessionProfile as getDemoSessionProfile } from "@/lib/data/accounts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Resolve the signed-in employee profile for dashboard pages and APIs.
 * Returns null when not signed in (callers redirect to /login).
 * Demo mode: file-backed email/password account via a signed session cookie.
 * Supabase mode: Supabase session cookie -> profiles row.
 */
export async function getSessionProfile(): Promise<Profile | null> {
  if (isDemoMode()) return getDemoSessionProfile();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return profile ?? null;
}
