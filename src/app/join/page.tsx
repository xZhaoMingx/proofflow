import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { getInvitationByToken } from "@/lib/data/invitations";
import { JoinForm } from "@/components/join-form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Join the team" };
export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  // Already signed in → nothing to accept.
  const profile = await getSessionProfile();
  if (profile) redirect("/projects");

  const { token } = await searchParams;
  const invite = token ? await getInvitationByToken(token) : null;

  if (!token || !invite) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Layers className="size-5" />
          </span>
          <h1 className="text-lg font-semibold">Invite not valid</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            This invite link is invalid, has expired, or was already used. Ask your team owner
            to send a new one.
          </p>
          <Button asChild variant="outline">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <JoinForm
      token={token}
      email={invite.email}
      fullName={invite.fullName}
      companyName={invite.companyName}
    />
  );
}
