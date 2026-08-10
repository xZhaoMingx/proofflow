import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { hasAnyAccount, registrationCodeRequired } from "@/lib/data/accounts";
import { hasAnyTeam } from "@/lib/data/team-auth";
import { getSessionProfile } from "@/lib/auth";
import { AuthForm } from "@/components/dashboard/auth-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in → straight to the dashboard.
  const profile = await getSessionProfile();
  if (profile) redirect("/projects");

  // Supabase mode: create-or-join the one shared team.
  if (!isDemoMode()) {
    return <AuthForm codeRequired hasAccounts={await hasAnyTeam()} />;
  }

  // Demo mode: file-backed accounts.
  return <AuthForm codeRequired={registrationCodeRequired()} hasAccounts={hasAnyAccount()} />;
}
