import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoDb } from "@/lib/data/demo-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clickUpApi } from "@/services/clickup/client";
import type { ClickUpConnection, ClickUpTaskLink, ProjectStatus } from "@/lib/types";

/**
 * Failure-tolerant sync layer between ProofFlow and ClickUp.
 * All entry points swallow errors (recording them on the task link) so the
 * core proofing workflow keeps working when ClickUp is unavailable.
 */

/** ProofFlow status -> ClickUp status name. Companies can remap later via sync_settings. */
const STATUS_MAP: Record<ProjectStatus, string> = {
  draft: "to do",
  awaiting_review: "in review",
  revision_requested: "in progress",
  approved: "approved",
  completed: "complete",
  archived: "complete",
};

interface SyncContext {
  connection: (ClickUpConnection & { access_token: string }) | null;
  link: ClickUpTaskLink | null;
}

async function getSyncContext(projectId: string): Promise<SyncContext> {
  if (isDemoMode()) {
    const db = demoDb();
    const conn = db.clickupConnection as (ClickUpConnection & { access_token: string }) | null;
    return {
      connection: conn,
      link: db.clickupTaskLinks.find((l) => l.project_id === projectId) ?? null,
    };
  }
  const supabase = createSupabaseAdminClient();
  const { data: link } = await supabase
    .from("clickup_task_links")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!link) return { connection: null, link: null };
  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();
  const { data: connection } = await supabase
    .from("clickup_connections")
    .select("*")
    .eq("company_id", project?.company_id ?? "")
    .maybeSingle();
  return { connection, link };
}

async function recordSyncResult(
  linkId: string,
  patch: Partial<Pick<ClickUpTaskLink, "clickup_status" | "clickup_assignee" | "sync_error">>
): Promise<void> {
  const stamped = { ...patch, last_synced_at: new Date().toISOString() };
  if (isDemoMode()) {
    const link = demoDb().clickupTaskLinks.find((l) => l.id === linkId);
    if (link) Object.assign(link, stamped);
    return;
  }
  const supabase = createSupabaseAdminClient();
  await supabase.from("clickup_task_links").update(stamped).eq("id", linkId);
}

/** Push a ProofFlow status change to the linked ClickUp task. Never throws. */
export async function pushProjectStatus(
  projectId: string,
  status: ProjectStatus
): Promise<void> {
  try {
    const { connection, link } = await getSyncContext(projectId);
    if (!connection || !link || connection.sync_settings.sync_status === false) return;
    const task = await clickUpApi.updateTask(connection.access_token, link.task_id, {
      status: STATUS_MAP[status],
    });
    await recordSyncResult(link.id, {
      clickup_status: task.status?.status ?? STATUS_MAP[status],
      sync_error: null,
    });
  } catch (err) {
    console.error("[clickup] pushProjectStatus failed:", err);
    const { link } = await getSyncContext(projectId).catch(() => ({ link: null }));
    if (link) {
      await recordSyncResult(link.id, {
        sync_error: err instanceof Error ? err.message : "Sync failed",
      }).catch(() => {});
    }
  }
}

/** Push a comment to the linked ClickUp task when comment sync is enabled. Never throws. */
export async function pushComment(projectId: string, authorName: string, body: string): Promise<void> {
  try {
    const { connection, link } = await getSyncContext(projectId);
    if (!connection || !link || connection.sync_settings.sync_comments !== true) return;
    await clickUpApi.addComment(
      connection.access_token,
      link.task_id,
      `[ProofFlow] ${authorName}: ${body}`
    );
  } catch (err) {
    console.error("[clickup] pushComment failed:", err);
  }
}

/** Pull latest task state from ClickUp ("Sync Now"). Returns the refreshed link or an error message. */
export async function pullTask(
  projectId: string
): Promise<{ ok: true; link: ClickUpTaskLink } | { ok: false; error: string }> {
  const { connection, link } = await getSyncContext(projectId);
  if (!link) return { ok: false, error: "No ClickUp task is linked to this project." };
  if (!connection) return { ok: false, error: "ClickUp is not connected for this company." };
  try {
    const task = await clickUpApi.getTask(connection.access_token, link.task_id);
    await recordSyncResult(link.id, {
      clickup_status: task.status?.status ?? null,
      clickup_assignee: task.assignees[0]?.username ?? null,
      sync_error: null,
    });
    const refreshed = { ...link, clickup_status: task.status?.status ?? null, clickup_assignee: task.assignees[0]?.username ?? null, last_synced_at: new Date().toISOString(), sync_error: null };
    return { ok: true, link: refreshed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await recordSyncResult(link.id, { sync_error: message }).catch(() => {});
    return { ok: false, error: message };
  }
}

/** Apply an inbound webhook event (task status/assignee changed in ClickUp). */
export async function applyWebhookEvent(taskId: string): Promise<void> {
  if (isDemoMode()) return;
  const supabase = createSupabaseAdminClient();
  const { data: link } = await supabase
    .from("clickup_task_links")
    .select("*, projects!inner(company_id)")
    .eq("task_id", taskId)
    .maybeSingle();
  if (!link) return;
  const { data: connection } = await supabase
    .from("clickup_connections")
    .select("*")
    .eq("company_id", link.projects.company_id)
    .maybeSingle();
  if (!connection) return;
  try {
    const task = await clickUpApi.getTask(connection.access_token, taskId);
    await supabase
      .from("clickup_task_links")
      .update({
        clickup_status: task.status?.status ?? null,
        clickup_assignee: task.assignees[0]?.username ?? null,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", link.id);
  } catch (err) {
    console.error("[clickup] applyWebhookEvent failed:", err);
  }
}
