import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoDb } from "@/lib/data/demo-store";
import { loadClickUpConnection } from "@/lib/data/clickup-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clickUpApi } from "@/services/clickup/client";
import type { ClickUpConnection, ClickUpTaskLink, ProjectStatus } from "@/lib/types";

/**
 * Demo-mode connection resolution shared by every entry point: in-memory
 * (set this session) → persisted file (survives restarts) → env token.
 */
async function resolveDemoConnection(): Promise<
  (ClickUpConnection & { access_token: string }) | null
> {
  const inMemory = demoDb().clickupConnection;
  if (inMemory?.access_token) {
    return inMemory as ClickUpConnection & { access_token: string };
  }
  const persisted = loadClickUpConnection();
  if (persisted) {
    demoDb().clickupConnection = persisted;
    return persisted;
  }
  return getEnvConnection();
}

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
    return {
      connection: await resolveDemoConnection(),
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
  return { connection: connection ?? (await getEnvConnection()), link };
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

/**
 * Connection from the CLICKUP_API_TOKEN env key: set it in .env.local and the
 * app links to ClickUp with no settings-page setup. The workspace and a
 * "ProofFlow" submissions list are resolved once and cached; a connection
 * configured in Settings always takes precedence.
 */
const envCache = globalThis as unknown as {
  __proofflowClickupEnv?: { token: string; workspaceId: string | null; listId: string | null };
};

async function getEnvConnection(): Promise<
  (ClickUpConnection & { access_token: string }) | null
> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) return null;

  if (!envCache.__proofflowClickupEnv || envCache.__proofflowClickupEnv.token !== token) {
    try {
      const { teams } = await clickUpApi.getWorkspaces(token);
      const workspaceId = teams[0]?.id ?? null;
      let listId = process.env.CLICKUP_LIST_ID?.trim() || null;
      if (!listId && workspaceId) {
        const { spaces } = await clickUpApi.getSpaces(token, workspaceId);
        if (spaces[0]) {
          const { lists } = await clickUpApi.getFolderlessLists(token, spaces[0].id);
          listId =
            lists.find((l) => l.name === "ProofFlow")?.id ??
            (await clickUpApi.createList(token, spaces[0].id, "ProofFlow")).id;
        }
      }
      envCache.__proofflowClickupEnv = { token, workspaceId, listId };
    } catch (err) {
      console.error("[clickup] CLICKUP_API_TOKEN setup failed:", err);
      return null;
    }
  }

  const resolved = envCache.__proofflowClickupEnv;
  return {
    id: "env",
    company_id: "env",
    workspace_id: resolved.workspaceId ?? "",
    space_id: null,
    folder_id: null,
    list_id: resolved.listId,
    webhook_id: null,
    sync_settings: { sync_status: true },
    access_token: token,
  };
}

/** Fetch the company's ClickUp connection for a project (link not required). */
async function getConnectionForProject(
  projectId: string
): Promise<(ClickUpConnection & { access_token: string }) | null> {
  if (isDemoMode()) {
    return resolveDemoConnection();
  }
  const supabase = createSupabaseAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();
  if (!project) return null;
  const { data: connection } = await supabase
    .from("clickup_connections")
    .select("*")
    .eq("company_id", project.company_id)
    .maybeSingle();
  return connection ?? (await getEnvConnection());
}

export interface ClickUpSubmission {
  kind: "approved" | "changes_requested";
  projectName: string;
  customerName: string;
  customerEmail: string;
  versionNumber: number | undefined;
  comment: string;
  checklist?: { label: string; checked: boolean }[];
}

/**
 * Create a task in the company's "ProofFlow" ClickUp list for a customer
 * submission (approval or change request), so the team sees it in ClickUp
 * with zero per-project setup. Never throws.
 */
export async function sendSubmissionToClickUp(
  projectId: string,
  submission: ClickUpSubmission
): Promise<void> {
  try {
    const connection = await getConnectionForProject(projectId);
    if (!connection?.list_id) return;

    const approved = submission.kind === "approved";
    const name = approved
      ? `✅ Proof approved — ${submission.projectName}`
      : `🔁 Changes requested — ${submission.projectName}`;

    const lines = [
      `**Project:** ${submission.projectName}`,
      `**Customer:** ${submission.customerName} <${submission.customerEmail}>`,
      submission.versionNumber ? `**Proof version:** ${submission.versionNumber}` : null,
      `**Submitted:** ${new Date().toLocaleString()}`,
      submission.comment ? `\n> ${submission.comment.replace(/\n/g, "\n> ")}` : null,
    ].filter(Boolean) as string[];

    if (approved && submission.checklist?.length) {
      lines.push(
        "\n**Checklist:**",
        ...submission.checklist.map((item) => `- [${item.checked ? "x" : " "}] ${item.label}`)
      );
    }

    const task = await clickUpApi.createTask(connection.access_token, connection.list_id, {
      name,
      markdown_description: lines.join("\n"),
    });
    console.log(`[clickup] submission task created: ${task.url}`);
  } catch (err) {
    console.error("[clickup] sendSubmissionToClickUp failed:", err);
  }
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
