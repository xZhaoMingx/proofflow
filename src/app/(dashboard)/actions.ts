"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import {
  addChecklistItem,
  addEmployeeComment,
  createProject,
  createReviewLink,
  removeChecklistItem,
  renameChecklistItem,
  reorderChecklistItems,
  updateProjectStatus,
  uploadVersion,
} from "@/lib/data/projects";
import { getClickUpLists, linkTask, saveConnection } from "@/lib/data/clickup";
import { pullTask } from "@/services/clickup/sync";
import {
  checklistItemSchema,
  clickupSettingsSchema,
  createProjectSchema,
  uploadVersionSchema,
  validateProofFile,
} from "@/lib/validation";
import { isDemoMode } from "@/lib/env";
import { demoDb } from "@/lib/data/demo-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireProfile() {
  const profile = await getSessionProfile();
  if (!profile) throw new Error("Not signed in.");
  return profile;
}

export async function createProjectAction(
  input: unknown
): Promise<ActionResult<{ projectId: string }>> {
  try {
    const profile = await requireProfile();
    const parsed = createProjectSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const project = await createProject(profile, parsed.data);
    revalidatePath("/projects");
    return { ok: true, data: { projectId: project.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create project." };
  }
}

export async function uploadVersionAction(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const projectId = formData.get("projectId");
    const file = formData.get("file");
    if (typeof projectId !== "string" || !(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a proof file to upload." };
    }
    const fileError = validateProofFile(file);
    if (fileError) return { ok: false, error: fileError };

    const parsed = uploadVersionSchema.safeParse({
      revisionNotes: formData.get("revisionNotes") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    await uploadVersion(profile, projectId, file, parsed.data.revisionNotes);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

export async function createReviewLinkAction(
  projectId: string,
  expiresInDays: number | null
): Promise<ActionResult<{ token: string }>> {
  try {
    const profile = await requireProfile();
    const link = await createReviewLink(profile, projectId, expiresInDays);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { token: link.token } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create link." };
  }
}

export async function updateStatusAction(
  projectId: string,
  status: ProjectStatus
): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    await updateProjectStatus(profile, projectId, status);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update status." };
  }
}

export async function addEmployeeCommentAction(
  projectId: string,
  body: string,
  isInternal: boolean
): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Comment cannot be empty." };
    await addEmployeeComment(profile, projectId, trimmed.slice(0, 10000), isInternal);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to post comment." };
  }
}

// --- Checklist administration -------------------------------------------------

export async function addChecklistItemAction(label: unknown): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return { ok: false, error: "Admins only." };
    const parsed = checklistItemSchema.safeParse({ label });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid label." };
    }
    await addChecklistItem(profile, parsed.data.label);
    revalidatePath("/settings/checklist");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add item." };
  }
}

export async function renameChecklistItemAction(
  itemId: string,
  label: unknown
): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return { ok: false, error: "Admins only." };
    const parsed = checklistItemSchema.safeParse({ label });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid label." };
    }
    await renameChecklistItem(profile, itemId, parsed.data.label);
    revalidatePath("/settings/checklist");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to rename item." };
  }
}

export async function removeChecklistItemAction(itemId: string): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return { ok: false, error: "Admins only." };
    await removeChecklistItem(profile, itemId);
    revalidatePath("/settings/checklist");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to remove item." };
  }
}

export async function reorderChecklistItemsAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return { ok: false, error: "Admins only." };
    await reorderChecklistItems(profile, orderedIds);
    revalidatePath("/settings/checklist");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reorder." };
  }
}

// --- ClickUp ------------------------------------------------------------------

export async function saveClickUpAction(input: unknown): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return { ok: false, error: "Admins only." };
    const parsed = clickupSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
    }
    const result = await saveConnection(profile, {
      accessToken: parsed.data.accessToken,
      workspaceId: parsed.data.workspaceId,
      spaceId: parsed.data.spaceId,
      folderId: parsed.data.folderId,
      listId: parsed.data.listId,
      syncSettings: {
        sync_status: parsed.data.syncStatus,
        sync_due_date: parsed.data.syncDueDate,
        sync_comments: parsed.data.syncComments,
        sync_attachments: parsed.data.syncAttachments,
      },
    });
    if (!result.ok) return result;
    revalidatePath("/settings/clickup");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save settings." };
  }
}

export async function getClickUpListsAction(): Promise<
  ActionResult<{ lists: { id: string; label: string }[] }>
> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return { ok: false, error: "Admins only." };
    const result = await getClickUpLists(profile);
    if (!result.ok) return result;
    return { ok: true, data: { lists: result.lists } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load lists." };
  }
}

export async function linkClickUpTaskAction(
  projectId: string,
  taskId: string
): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const trimmed = taskId.trim();
    if (!trimmed) return { ok: false, error: "Enter a ClickUp task ID." };
    const result = await linkTask(profile, projectId, trimmed);
    if (!result.ok) return result;
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to link task." };
  }
}

export async function syncClickUpNowAction(projectId: string): Promise<ActionResult> {
  try {
    await requireProfile();
    const result = await pullTask(projectId);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed." };
  }
}

// --- Notifications ------------------------------------------------------------

export async function markNotificationsReadAction(): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (isDemoMode()) {
      for (const n of demoDb().notifications) {
        if (n.recipient_id === profile.id && !n.read_at) n.read_at = new Date().toISOString();
      }
    } else {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", profile.id)
        .is("read_at", null);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed." };
  }
}
