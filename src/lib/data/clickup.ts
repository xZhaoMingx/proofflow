import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoDb, demoId } from "@/lib/data/demo-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clickUpApi } from "@/services/clickup/client";
import type { ClickUpConnection, ClickUpTaskLink, Profile } from "@/lib/types";

/** Employee/admin management of the ClickUp connection and task links. */

export async function getConnection(
  profile: Profile
): Promise<(ClickUpConnection & { access_token?: string }) | null> {
  if (isDemoMode()) return demoDb().clickupConnection;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clickup_connections")
    .select("id, company_id, workspace_id, space_id, folder_id, list_id, webhook_id, sync_settings")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  return data ?? null;
}

export interface SaveConnectionInput {
  accessToken: string;
  workspaceId: string;
  spaceId: string;
  folderId: string;
  listId: string;
  syncSettings: {
    sync_status: boolean;
    sync_due_date: boolean;
    sync_comments: boolean;
    sync_attachments: boolean;
  };
}

export async function saveConnection(
  profile: Profile,
  input: SaveConnectionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Verify the token before persisting it.
  try {
    await clickUpApi.getWorkspaces(input.accessToken);
  } catch {
    return { ok: false, error: "ClickUp rejected that API token. Double-check it and try again." };
  }

  if (isDemoMode()) {
    demoDb().clickupConnection = {
      id: demoId(),
      company_id: profile.company_id,
      workspace_id: input.workspaceId,
      space_id: input.spaceId || null,
      folder_id: input.folderId || null,
      list_id: input.listId || null,
      webhook_id: null,
      sync_settings: input.syncSettings,
      // Demo store keeps the token in memory only.
      ...( { access_token: input.accessToken } as object),
    } as ClickUpConnection;
    return { ok: true };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clickup_connections").upsert(
    {
      company_id: profile.company_id,
      workspace_id: input.workspaceId,
      space_id: input.spaceId || null,
      folder_id: input.folderId || null,
      list_id: input.listId || null,
      access_token: input.accessToken,
      sync_settings: input.syncSettings,
    },
    { onConflict: "company_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function linkTask(
  profile: Profile,
  projectId: string,
  taskId: string
): Promise<{ ok: true; link: ClickUpTaskLink } | { ok: false; error: string }> {
  const link: ClickUpTaskLink = {
    id: demoId(),
    project_id: projectId,
    task_id: taskId,
    task_url: `https://app.clickup.com/t/${taskId}`,
    clickup_status: null,
    clickup_assignee: null,
    last_synced_at: null,
    sync_error: null,
  };

  if (isDemoMode()) {
    const store = demoDb();
    const existing = store.clickupTaskLinks.findIndex((l) => l.project_id === projectId);
    if (existing >= 0) store.clickupTaskLinks.splice(existing, 1);
    store.clickupTaskLinks.push(link);
    return { ok: true, link };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clickup_task_links")
    .upsert(
      { project_id: projectId, task_id: taskId, task_url: link.task_url },
      { onConflict: "project_id" }
    )
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, link: data };
}
