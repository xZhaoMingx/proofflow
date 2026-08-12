"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { acceptInviteAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinForm({
  token,
  email,
  fullName,
  companyName,
}: {
  token: string;
  email: string;
  fullName: string;
  companyName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const result = await acceptInviteAction({
        token,
        email,
        fullName: form.get("fullName"),
        password: form.get("password"),
      });
      if (result.ok) {
        router.push("/projects");
        router.refresh();
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Layers className="size-5" />
        </span>
        <h1 className="text-center text-lg font-semibold">Join {companyName}</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
          Set your name and a password to accept the invite.
        </p>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="join-name">Full name</Label>
            <Input id="join-name" name="fullName" autoComplete="name" defaultValue={fullName} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="join-email">Email</Label>
            <Input id="join-email" type="email" value={email} readOnly disabled />
            <p className="text-xs text-muted-foreground">This invite is tied to your email.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="join-password">Password</Label>
            <Input
              id="join-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Join the team
          </Button>
        </form>
      </div>
    </main>
  );
}
