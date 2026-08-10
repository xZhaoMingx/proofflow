"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loginAction, signupAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AuthForm({
  codeRequired,
  hasAccounts,
}: {
  codeRequired: boolean;
  hasAccounts: boolean;
}) {
  const router = useRouter();
  // With no accounts yet, open on "Create account" so the first admin can register.
  const [tab, setTab] = useState<"login" | "signup">(hasAccounts ? "login" : "signup");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const result = await loginAction({
        email: form.get("email"),
        password: form.get("password"),
      });
      if (result.ok) {
        router.push("/projects");
        router.refresh();
        return; // keep the button disabled while we navigate away
      }
      toast.error(result.error);
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const result = await signupAction({
        fullName: form.get("fullName"),
        email: form.get("email"),
        password: form.get("password"),
        code: form.get("code") ?? "",
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
        <h1 className="mb-6 text-center text-lg font-semibold">ProofFlow</h1>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Log in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="grid gap-4 pt-4">
              <div className="grid gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Log in
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="grid gap-4 pt-4">
              <div className="grid gap-1.5">
                <Label htmlFor="signup-name">Full name</Label>
                <Input id="signup-name" name="fullName" autoComplete="name" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              {codeRequired && (
                <div className="grid gap-1.5">
                  <Label htmlFor="signup-code">Team code</Label>
                  <Input id="signup-code" name="code" type="password" required />
                  <p className="text-xs text-muted-foreground">
                    {hasAccounts
                      ? "Enter your team's code to join and see everyone's projects."
                      : "You're first — pick a team code, then share it so teammates can join."}
                  </p>
                </div>
              )}
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
