/**
 * Environment helpers. ProofFlow runs in one of two modes:
 *
 * - Supabase mode: NEXT_PUBLIC_SUPABASE_URL + keys are set. All data flows
 *   through Postgres with RLS, storage with signed URLs, and Supabase Auth.
 * - Demo mode: no Supabase env configured. An in-memory store (seeded with
 *   sample data) backs the same data-access API so the full UI and workflows
 *   can be exercised locally without any external services. Nothing persists
 *   across server restarts.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
