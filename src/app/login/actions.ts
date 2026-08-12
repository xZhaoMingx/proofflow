"use server";

import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import {
  createAccount,
  endSession,
  startSession,
  verifyCredentials,
} from "@/lib/data/accounts";
import { createOrJoinTeam, markLogin } from "@/lib/data/team-auth";
import { acceptInvitation } from "@/lib/data/invitations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(200),
  email: z.string().trim().email("Enter a valid email.").max(320),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  code: z.string().max(200).optional().default(""),
});

export async function loginAction(input: unknown): Promise<Result> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Supabase mode: sign in through the cookie-based server client so the
  // session cookie is set for subsequent requests.
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error || !data.user) return { ok: false, error: "Incorrect email or password." };
    await markLogin(data.user.id);
    return { ok: true };
  }

  // Demo mode: file-backed accounts.
  const profile = verifyCredentials(parsed.data.email, parsed.data.password);
  if (!profile) return { ok: false, error: "Incorrect email or password." };
  await startSession(profile.id);
  return { ok: true };
}

export async function signupAction(input: unknown): Promise<Result> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Supabase mode: create or join the shared team, then sign in.
  if (isSupabaseConfigured()) {
    const created = await createOrJoinTeam({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      password: parsed.data.password,
      teamCode: parsed.data.code,
    });
    if (!created.ok) return created;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) return { ok: false, error: "Account created — please log in." };
    return { ok: true };
  }

  // Demo mode.
  const result = createAccount({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    password: parsed.data.password,
    code: parsed.data.code,
  });
  if (!result.ok) return result;
  await startSession(result.profile.id);
  return { ok: true };
}

const acceptInviteSchema = z.object({
  token: z.string().min(1, "Missing invite token."),
  fullName: z.string().trim().min(1, "Enter your name.").max(200),
  email: z.string().trim().email("Enter a valid email.").max(320),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export async function acceptInviteAction(input: unknown): Promise<Result> {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Invites are only available on the live site." };
  }

  const accepted = await acceptInvitation(parsed.data);
  if (!accepted.ok) return accepted;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: "Account created — please log in." };
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return;
  }
  await endSession();
}
