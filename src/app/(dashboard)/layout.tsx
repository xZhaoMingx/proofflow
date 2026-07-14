import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical, Layers } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { listNotifications } from "@/lib/data/projects";
import { isDemoMode } from "@/lib/env";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { UserMenu } from "@/components/dashboard/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const notifications = await listNotifications(profile);
  const demo = isDemoMode();

  return (
    <div className="flex min-h-dvh flex-col">
      {demo && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <FlaskConical className="size-3.5" />
          Demo mode — data is in-memory and resets on restart. Add Supabase keys to .env.local
          to go live.
        </div>
      )}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/projects" className="flex items-center gap-2 font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Layers className="size-4" />
              </span>
              ProofFlow
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/projects"
                className="rounded-md px-3 py-1.5 font-medium hover:bg-muted"
              >
                Projects
              </Link>
              <Link
                href="/settings/checklist"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Checklist
              </Link>
              <Link
                href="/settings/clickup"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ClickUp
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell notifications={notifications} />
            <ThemeToggle />
            <UserMenu profile={profile} demo={demo} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
