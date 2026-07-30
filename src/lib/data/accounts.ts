import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { cookies } from "next/headers";
import type { Profile, ProfileRole } from "@/lib/types";

/**
 * Demo-mode email/password accounts. Persisted to a file under the user's home
 * dir so accounts (and the session-signing secret) survive dev-server
 * restarts. Passwords are scrypt-hashed; sessions are stateless signed cookies.
 *
 * Not used in Supabase mode, where Supabase Auth owns identities.
 */

export const SESSION_COOKIE = "pf_session";
// New accounts join the single demo company (mirrors demo-store's COMPANY_ID),
// so staff share the same projects, checklist, and ClickUp connection.
const DEMO_COMPANY_ID = "11111111-1111-1111-1111-111111111111";

interface StoredUser {
  id: string;
  company_id: string;
  role: ProfileRole;
  full_name: string;
  email: string;
  salt: string;
  hash: string;
  created_at: string;
}

interface AccountsFile {
  secret: string;
  users: StoredUser[];
}

const CONFIG_DIR = path.join(os.homedir(), ".proofflow");
const CONFIG_PATH = path.join(CONFIG_DIR, "accounts.json");

function loadFile(): AccountsFile {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AccountsFile;
    if (parsed && Array.isArray(parsed.users) && typeof parsed.secret === "string") {
      return parsed;
    }
  } catch {
    // Missing/unreadable → start fresh below.
  }
  return { secret: randomBytes(32).toString("hex"), users: [] };
}

function saveFile(data: AccountsFile): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

function toProfile(user: StoredUser): Profile {
  return {
    id: user.id,
    company_id: user.company_id,
    role: user.role,
    full_name: user.full_name,
    email: user.email,
    avatar_url: null,
  };
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function signUserId(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

// --- Public API --------------------------------------------------------------

export function listProfiles(companyId: string): Profile[] {
  return loadFile()
    .users.filter((u) => u.company_id === companyId)
    .map(toProfile);
}

export function findProfile(id: string): Profile | null {
  const user = loadFile().users.find((u) => u.id === id);
  return user ? toProfile(user) : null;
}

export function hasAnyAccount(): boolean {
  return loadFile().users.length > 0;
}

/** Signup requires the team code (APP_PASSWORD) so randoms can't self-register. */
export function registrationCodeRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

export interface CreateAccountInput {
  fullName: string;
  email: string;
  password: string;
  code: string;
}

export function createAccount(
  input: CreateAccountInput
): { ok: true; profile: Profile } | { ok: false; error: string } {
  if (registrationCodeRequired() && input.code.trim() !== process.env.APP_PASSWORD!.trim()) {
    return { ok: false, error: "Wrong team code." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const data = loadFile();
  const email = input.email.trim().toLowerCase();
  if (data.users.some((u) => u.email === email)) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: randomBytes(16).toString("hex"),
    company_id: DEMO_COMPANY_ID,
    // First account is the admin; everyone can still use every feature (all admin for now).
    role: "admin",
    full_name: input.fullName.trim(),
    email,
    salt,
    hash: hashPassword(input.password, salt),
    created_at: new Date().toISOString(),
  };
  data.users.push(user);
  saveFile(data);
  return { ok: true, profile: toProfile(user) };
}

export function verifyCredentials(email: string, password: string): Profile | null {
  const user = loadFile().users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return null;
  const attempt = hashPassword(password, user.salt);
  const expected = user.hash;
  if (attempt.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(attempt), Buffer.from(expected))) return null;
  return toProfile(user);
}

// --- Session cookie ----------------------------------------------------------

export async function startSession(userId: string): Promise<void> {
  const { secret } = loadFile();
  const value = `${userId}.${signUserId(userId, secret)}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionProfile(): Promise<Profile | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [userId, sig] = raw.split(".");
  if (!userId || !sig) return null;

  const data = loadFile();
  const expected = signUserId(userId, data.secret);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  const user = data.users.find((u) => u.id === userId);
  return user ? toProfile(user) : null;
}
