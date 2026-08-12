"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { inviteTeammateAction, revokeInvitationAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PendingInvitation } from "@/lib/data/invitations";

export function TeamInvitePanel({
  pending,
  baseUrl,
}: {
  pending: PendingInvitation[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pendingSubmit, startSubmit] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  const linkFor = (token: string) => `${baseUrl}/join?token=${token}`;

  async function copy(link: string, key: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(key);
      toast.success("Invite link copied — send it to your teammate.");
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.");
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startSubmit(async () => {
      const result = await inviteTeammateAction(email, fullName);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await copy(result.link, "new");
      setEmail("");
      setFullName("");
      router.refresh();
    });
  }

  function revoke(id: string) {
    startSubmit(async () => {
      const result = await revokeInvitationAction(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite revoked.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Lee"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.com"
                required
              />
            </div>
            <Button type="submit" disabled={pendingSubmit || !email.trim() || !fullName.trim()}>
              {pendingSubmit ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Create invite
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Creating an invite copies a private link to your clipboard. Send it however you like —
            the person joins without needing the team code.
          </p>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Pending invites</p>
            <ul className="flex flex-col gap-2">
              {pending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{inv.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{inv.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copy(linkFor(inv.token), inv.id)}
                    >
                      {copied === inv.id ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      Copy link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke(inv.id)}
                      disabled={pendingSubmit}
                      aria-label={`Revoke invite for ${inv.email}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
