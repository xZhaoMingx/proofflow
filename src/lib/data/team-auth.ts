import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Single-shared-team signup for Supabase mode. The first person to sign up
 * creates the team and becomes its owner (choosing a team code); everyone
 * afterwards joins that same team by entering the matching code. All members
 * share one workspace and see every project — company isolation still holds if
 * a second team is ever created, but the app is built around one team here.
 */

const DEFAULT_CHECKLIST = [
  "Spelling", "Colors", "Layout", "Dimensions", "Logo Placement",
  "Contact Information", "QR Code", "Safe Area", "Material", "Finishing",
];

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface CreateOrJoinInput {
  fullName: string;
  email: string;
  password: string;
  teamCode: string;
  teamName?: string;
}

export async function createOrJoinTeam(
  input: CreateOrJoinInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();

  // Is there already a team? (One shared workspace.)
  const { data: teams } = await admin
    .from("companies")
    .select("id, name, settings")
    .limit(1);
  const existing = teams?.[0];

  let companyId: string;
  let role: "owner" | "employee";

  if (!existing) {
    // First user creates the team and becomes owner.
    const name = input.teamName?.trim() || `${input.fullName}'s Team`;
    const base = slugify(name) || "team";
    let slug = base;
    for (let n = 2; ; n++) {
      const { data: clash } = await admin
        .from("companies")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${base}-${n}`;
    }

    const { data: company, error } = await admin
      .from("companies")
      .insert({
        name,
        slug,
        settings: { require_full_checklist: true, capture_ip: false, join_code: input.teamCode },
      })
      .select("id")
      .single();
    if (error || !company) {
      return { ok: false, error: error?.message ?? "Could not create the team." };
    }
    companyId = company.id;
    role = "owner";

    await admin.from("checklist_items").insert(
      DEFAULT_CHECKLIST.map((label, i) => ({ company_id: companyId, label, sort_order: i }))
    );
  } else {
    // Everyone else joins the existing team with the shared code.
    const code = (existing.settings as { join_code?: string } | null)?.join_code ?? "";
    if (code && input.teamCode.trim() !== code) {
      return { ok: false, error: "Wrong team code — ask a teammate for it." };
    }
    companyId = existing.id;
    role = "employee";
  }

  // Create the auth user (pre-confirmed so they can sign in immediately).
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: input.email,
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
    company_id: companyId,
    role,
    status: "active",
    full_name: input.fullName,
    email: input.email,
  });
  if (profileErr) {
    // Roll back the orphaned auth user so the email can be reused.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: profileErr.message };
  }

  if (role === "owner") {
    await admin.from("companies").update({ owner_id: created.user.id }).eq("id", companyId);
  }

  return { ok: true };
}

/** Whether the shared team has been created yet (drives the signup default). */
export async function hasAnyTeam(): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("companies").select("id").limit(1);
  return Boolean(data && data.length > 0);
}

/** Stamp last_login_at after a successful sign-in. Never throws. */
export async function markLogin(userId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", userId);
  } catch {
    // non-critical
  }
}
