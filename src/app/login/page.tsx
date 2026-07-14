import Link from "next/link";
import { FlaskConical, Layers } from "lucide-react";
import { isDemoMode } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/dashboard/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  if (isDemoMode()) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Layers className="size-5" />
          </span>
          <h1 className="text-lg font-semibold">ProofFlow</h1>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <FlaskConical className="size-4" /> Running in demo mode
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign-in is skipped and you&apos;re browsing as the demo admin. Configure Supabase in
            .env.local to enable real accounts.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/projects">Open dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }
  return <LoginForm />;
}
