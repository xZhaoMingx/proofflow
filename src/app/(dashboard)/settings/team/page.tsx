import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isDemoMode, appUrl } from "@/lib/env";
import { listTeamMembers, listPendingInvitations } from "@/lib/data/invitations";
import { TeamInvitePanel } from "@/components/dashboard/team-invite-panel";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  employee: "Member",
};

export default async function TeamPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const isOwner = profile.role === "owner";

  if (isDemoMode()) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inviting teammates is available on the live site (Supabase mode).
          </p>
        </div>
      </div>
    );
  }

  const [members, pending] = await Promise.all([
    listTeamMembers(profile),
    isOwner ? listPendingInvitations(profile) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone here shares one workspace and sees every project.
          {isOwner ? " Invite a teammate with a private link — no team code needed." : ""}
        </p>
      </div>

      {isOwner && <TeamInvitePanel pending={pending} baseUrl={appUrl()} />}

      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Members ({members.length})</p>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.full_name}
                    {m.id === profile.id ? " (you)" : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
