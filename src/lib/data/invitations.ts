import "server-only";
import { randomBytes } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

/**
 * Email-less "invite by link" flow for the shared team. The owner creates an
 * invitation (an email + a unique token); the invitee opens /join?token=... and
 * signs up straight into the team — no team code needed. Mirrors the account
 * creation in team-auth.ts (admin client, pre-confirmed user, explicit profile).
 */

export interface PendingInvitation {
  id: string;
  email: string;
  full_name: string;
  token: string;
  created_at: string;
  expires_at: string;
}

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Owner creates (or refreshes) an employee invite. Returns the invite token. */
export async function createInvitation(
  profile: Profile,
  input: { email: string; fullName: string }
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();

  // Already a member of this team?
  const { data: member } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", profile.company_id)
    .ilike("email", email)
    .maybeSingle();
  if (member) return { ok: false, error: "That email is already on your team." };

  // One live invite per email: retire any earlier pending invite first.
  await admin
    .from("invitations")
    .update({ status: "revoked" })
    .eq("company_id", profile.company_id)
    .eq("kind", "employee")
    .eq("status", "pending")
    .ilike("email", email);

  const token = newToken();
  const { error } = await admin.from("invitations").insert({
    company_id: profile.company_id,
    kind: "employee",
    email,
    full_name: input.fullName.trim() || email.split("@")[0],
    role: "employee",
    token,
    invited_by: profile.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token };
}

/** Pending, non-expired employee invites for the team. */
export async function listPendingInvitations(profile: Profile): Promise<PendingInvitation[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("invitations")
    .select("id, email, full_name, token, created_at, expires_at")
    .eq("company_id", profile.company_id)
    .eq("kind", "employee")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Everyone on the team (for the roster). */
export async function listTeamMembers(profile: Profile): Promise<TeamMember[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    email: m.email,
    role: m.role,
  }));
}

export async function revokeInvitation(profile: Profile, id: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("company_id", profile.company_id);
}

/** Look up a pending, non-expired invite by its token (for the /join page). */
export async function getInvitationByToken(
  token: string
): Promise<{ companyName: string; email: string; fullName: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("invitations")
    .select("email, full_name, status, expires_at, companies(name)")
    .eq("token", token)
    .eq("kind", "employee")
    .maybeSingle();
  if (!data || data.status !== "pending") return null;
  if (new Date(data.expires_at) < new Date()) return null;
  const companyName = (data.companies as { name?: string } | null)?.name ?? "the team";
  return { companyName, email: data.email, fullName: data.full_name };
}

/** Accept an invite: create the account + profile in the invited team. */
export async function acceptInvitation(input: {
  token: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();

  const { data: inv } = await admin
    .from("invitations")
    .select("id, company_id, email, full_name, role, status, expires_at, invited_by")
    .eq("token", input.token)
    .eq("kind", "employee")
    .maybeSingle();
  if (!inv || inv.status !== "pending") {
    return { ok: false, error: "This invite is no longer valid." };
  }
  if (new Date(inv.expires_at) < new Date()) {
    return { ok: false, error: "This invite has expired — ask for a new one." };
  }
  if (inv.email.toLowerCase() !== input.email.trim().toLowerCase()) {
    return { ok: false, error: "Use the email address the invite was sent to." };
  }

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (userErr || !created?.user) {
    const msg = userErr?.message ?? "Could not create the account.";
    return {
      ok: false,
      error: /registered|already/i.test(msg) ? "An account with that email already exists." : msg,
    };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    company_id: inv.company_id,
    role: inv.role ?? "employee",
    status: "active",
    full_name: input.fullName.trim() || inv.full_name,
    email: input.email.trim(),
    invited_by: inv.invited_by,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: profileErr.message };
  }

  await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);
  return { ok: true };
}
