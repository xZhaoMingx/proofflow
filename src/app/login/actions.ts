"use server";

import { z } from "zod";
import {
  createAccount,
  endSession,
  startSession,
  verifyCredentials,
} from "@/lib/data/accounts";

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

export async function logoutAction(): Promise<void> {
  await endSession();
}
