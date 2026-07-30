import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { hasAnyAccount, registrationCodeRequired } from "@/lib/data/accounts";
import { getSessionProfile } from "@/lib/auth";
import { AuthForm } from "@/components/dashboard/auth-form";
import { LoginForm } from "@/components/dashboard/login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in → straight to the dashboard.
  const profile = await getSessionProfile();
  if (profile) redirect("/projects");

  if (isDemoMode()) {
    return (
      <AuthForm codeRequired={registrationCodeRequired()} hasAccounts={hasAnyAccount()} />
    );
  }
  return <LoginForm />;
}
