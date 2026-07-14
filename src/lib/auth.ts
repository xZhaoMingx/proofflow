import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoProfile } from "@/lib/data/demo-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Resolve the signed-in employee profile for dashboard pages and APIs.
 * Demo mode: a fixed demo admin so the dashboard is browsable without auth.
 * Supabase mode: session cookie -> profiles row (null means redirect to /login).
 */
export async function getSessionProfile(): Promise<Profile | null> {
  if (isDemoMode()) return demoProfile();

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
