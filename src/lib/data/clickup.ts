import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoDb, demoId } from "@/lib/data/demo-store";
import {
  loadClickUpConnection,
  saveClickUpConnection,
  type StoredClickUpConnection,
} from "@/lib/data/clickup-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clickUpApi } from "@/services/clickup/client";
import type { ClickUpConnection, ClickUpTaskLink, Profile } from "@/lib/types";

/** Employee/admin management of the ClickUp connection and task links. */

function envToken(): string | null {
  return process.env.CLICKUP_API_TOKEN?.trim() || null;
}

/**
 * Demo-mode connection, in priority order: in-memory (set this session) →
 * persisted file (survives restarts) → an env-token connection so the API key
 * in .env.local counts as "connected" without any Settings step. Hydrates the
 * in-memory store so the hot submission path stays cheap.
 */
export function getDemoConnection(companyId: string): StoredClickUpConnection | null {
  const store = demoDb();
  if (store.clickupConnection && store.clickupConnection.access_token) {
    return store.clickupConnection as StoredClickUpConnection;
  }
  const persisted = loadClickUpConnection();
  if (persisted) {
    store.clickupConnection = persisted;
    return persisted;
  }
  const token = envToken();
  if (token) {
    return {
      id: "env",
      company_id: companyId,
      workspace_id: "",
      space_id: null,
      folder_id: null,
      list_id: process.env.CLICKUP_LIST_ID?.trim() || null,
      webhook_id: null,
      sync_settings: { sync_status: true, sync_due_date: false, sync_comments: false, sync_attachments: false },
      access_token: token,
    };
  }
  return null;
}

export async function getConnection(
  profile: Profile
): Promise<(ClickUpConnection & { access_token?: string }) | null> {
  if (isDemoMode()) return getDemoConnection(profile.company_id);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clickup_connections")
    .select("id, company_id, workspace_id, space_id, folder_id, list_id, webhook_id, sync_settings")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  return data ?? null;
}

export interface ClickUpListOption {
  id: string;
  label: string;
}

/**
 * All folderless lists across the connected workspace's spaces, labelled
 * "Space / List", so Settings can offer a dropdown instead of a pasted ID.
 */
export async function getClickUpLists(
  profile: Profile
): Promise<{ ok: true; lists: ClickUpListOption[] } | { ok: false; error: string }> {
  const connection = await getConnection(profile);
  const token = connection?.access_token || envToken();
  if (!token) {
    return { ok: false, error: "Connect ClickUp first (add your API token)." };
  }
  try {
    const workspaceId =
      connection?.workspace_id || (await clickUpApi.getWorkspaces(token)).teams[0]?.id;
    if (!workspaceId) return { ok: false, error: "That token has no ClickUp workspaces." };

    const { spaces } = await clickUpApi.getSpaces(token, workspaceId);
    const lists: ClickUpListOption[] = [];
    for (const space of spaces) {
      const { lists: spaceLists } = await clickUpApi.getFolderlessLists(token, space.id);
      for (const list of spaceLists) {
        lists.push({ id: list.id, label: `${space.name} / ${list.name}` });
      }
    }
    return { ok: true, lists };
  } catch {
    return { ok: false, error: "Couldn't load your ClickUp lists. Check the API token." };
  }
}

/** List where customer submissions land as ClickUp tasks. */
const SUBMISSIONS_LIST_NAME = "ProofFlow";

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
  // Token comes from the form, or falls back to CLICKUP_API_TOKEN in .env.local
  // so it never has to be re-typed just to change a setting.
  const token = input.accessToken.trim() || envToken();
  if (!token) {
    return { ok: false, error: "Add your ClickUp API token to connect." };
  }

  // Verify the token (and auto-detect the workspace when not provided).
  let workspaceId = input.workspaceId.trim();
  try {
    const { teams } = await clickUpApi.getWorkspaces(token);
    if (!teams.length) return { ok: false, error: "That token has no ClickUp workspaces." };
    if (!workspaceId) workspaceId = teams[0].id;
  } catch {
    return { ok: false, error: "ClickUp rejected that API token. Double-check it and try again." };
  }

  // Customer submissions (approve / request changes) are created as tasks in
  // a list. Use the chosen List ID, or find/create a "ProofFlow" list —
  // failures degrade gracefully and the connection still saves.
  let listId: string | null = input.listId || null;
  if (!listId) {
    try {
      const spaceId =
        input.spaceId || (await clickUpApi.getSpaces(token, workspaceId)).spaces[0]?.id;
      if (spaceId) {
        const { lists } = await clickUpApi.getFolderlessLists(token, spaceId);
        const existing = lists.find((l) => l.name === SUBMISSIONS_LIST_NAME);
        listId = existing
          ? existing.id
          : (await clickUpApi.createList(token, spaceId, SUBMISSIONS_LIST_NAME)).id;
      }
    } catch (err) {
      console.error("[clickup] could not prepare submissions list:", err);
    }
  }

  if (isDemoMode()) {
    const connection: StoredClickUpConnection = {
      id: demoId(),
      company_id: profile.company_id,
      workspace_id: workspaceId,
      space_id: input.spaceId || null,
      folder_id: input.folderId || null,
      list_id: listId,
      webhook_id: null,
      sync_settings: input.syncSettings,
      access_token: token,
    };
    demoDb().clickupConnection = connection;
    // Survive dev-server restarts so this only has to be set once.
    saveClickUpConnection(connection);
    return { ok: true };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clickup_connections").upsert(
    {
      company_id: profile.company_id,
      workspace_id: input.workspaceId,
      space_id: input.spaceId || null,
      folder_id: input.folderId || null,
      list_id: listId,
      access_token: token,
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
