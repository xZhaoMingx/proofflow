import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. Server-only: used by token-validated customer routes
 * (customers have no Supabase session) and by integration/webhook handlers.
 * Every caller is responsible for scoping queries to the validated project.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return adminClient;
}
