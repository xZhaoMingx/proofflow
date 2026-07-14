import "server-only";
import { randomBytes } from "crypto";
import { isDemoMode } from "@/lib/env";
import { demoDb, demoId } from "@/lib/data/demo-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyCustomer } from "@/lib/notifications";
import { storeFile } from "@/lib/storage";
import { pushComment, pushProjectStatus } from "@/services/clickup/sync";
import { appUrl } from "@/lib/env";
import type {
  ActivityAction,
  ActivityEvent,
  AuthorType,
  ChecklistItem,
  ClickUpTaskLink,
  Comment,
  Company,
  Customer,
  Profile,
  Project,
  ProjectStatus,
  ProofVersion,
  ReviewLink,
} from "@/lib/types";

/**
 * Employee-side data access for the dashboard. In Supabase mode these run
 * through the cookie-authenticated client, so RLS enforces company scoping;
 * mutations that must bypass RLS (none today) would use the admin client.
 */

async function db() {
  return await createSupabaseServerClient();
}

export interface ProjectListItem extends Project {
  customer: Customer | null;
  latestVersion: number;
  reviewToken: string | null;
}

export interface ProjectDetail {
  project: Project;
  company: Company;
  customer: Customer | null;
  designer: Pick<Profile, "id" | "full_name"> | null;
  versions: ProofVersion[];
  reviewLinks: ReviewLink[];
  comments: Comment[]; // includes internal notes; UI separates them
  activity: ActivityEvent[];
  clickup: ClickUpTaskLink | null;
}

export async function listProjects(profile: Profile): Promise<ProjectListItem[]> {
  if (isDemoMode()) {
    const store = demoDb();
    return store.projects.map((p) => ({
      ...p,
      customer: store.customers.find((c) => c.id === p.customer_id) ?? null,
      latestVersion: Math.max(
        0,
        ...store.versions.filter((v) => v.project_id === p.id).map((v) => v.version_number)
      ),
      reviewToken:
        store.reviewLinks.find((l) => l.project_id === p.id && !l.revoked_at)?.token ?? null,
    }));
  }

  const supabase = await db();
  const { data: projects } = await supabase
    .from("projects")
    .select("*, customers(*), proof_versions(version_number), review_links(token, revoked_at)")
    .eq("company_id", profile.company_id)
    .order("updated_at", { ascending: false });

  return (projects ?? []).map((p) => {
    const { customers, proof_versions, review_links, ...project } = p;
    return {
      ...project,
      customer: customers ?? null,
      latestVersion: Math.max(
        0,
        ...(proof_versions ?? []).map((v: { version_number: number }) => v.version_number)
      ),
      reviewToken:
        (review_links ?? []).find((l: { revoked_at: string | null }) => !l.revoked_at)?.token ??
        null,
    };
  });
}

export async function getProjectDetail(
  profile: Profile,
  projectId: string
): Promise<ProjectDetail | null> {
  if (isDemoMode()) {
    const store = demoDb();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return null;
    return {
      project,
      company: store.company,
      customer: store.customers.find((c) => c.id === project.customer_id) ?? null,
      designer:
        store.profiles
          .filter((p) => p.id === project.designer_id)
          .map((p) => ({ id: p.id, full_name: p.full_name }))[0] ?? null,
      versions: store.versions
        .filter((v) => v.project_id === projectId)
        .sort((a, b) => b.version_number - a.version_number),
      reviewLinks: store.reviewLinks.filter((l) => l.project_id === projectId),
      comments: store.comments
        .filter((c) => c.project_id === projectId)
        .map((c) => ({
          ...c,
          attachments: store.attachments.filter(
            (a) => a.parent_type === "comment" && a.parent_id === c.id
          ),
        }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      activity: store.activity
        .filter((a) => a.project_id === projectId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      clickup: store.clickupTaskLinks.find((l) => l.project_id === projectId) ?? null,
    };
  }

  const supabase = await db();
  const { data: project } = await supabase
    .from("projects")
    .select("*, companies(*), customers(*), profiles:designer_id(id, full_name)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const [{ data: versions }, { data: links }, { data: comments }, { data: activity }, { data: clickup }] =
    await Promise.all([
      supabase
        .from("proof_versions")
        .select("*")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false }),
      supabase.from("review_links").select("*").eq("project_id", projectId),
      supabase.from("comments").select("*").eq("project_id", projectId).order("created_at"),
      supabase
        .from("activity_events")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase.from("clickup_task_links").select("*").eq("project_id", projectId).maybeSingle(),
    ]);

  const { companies, customers, profiles, ...projectRow } = project;
  return {
    project: projectRow,
    company: companies,
    customer: customers ?? null,
    designer: profiles ?? null,
    versions: versions ?? [],
    reviewLinks: links ?? [],
    comments: comments ?? [],
    activity: activity ?? [],
    clickup: clickup ?? null,
  };
}

async function logActivity(
  projectId: string,
  actorType: AuthorType,
  actorName: string,
  action: ActivityAction,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (isDemoMode()) {
    demoDb().activity.push({
      id: demoId(),
      project_id: projectId,
      actor_type: actorType,
      actor_name: actorName,
      action,
      metadata,
      created_at: new Date().toISOString(),
    });
    return;
  }
  const supabase = await db();
  await supabase.from("activity_events").insert({
    project_id: projectId,
    actor_type: actorType,
    actor_name: actorName,
    action,
    metadata,
  });
}

export interface CreateProjectInput {
  name: string;
  jobNumber: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  dueDate: string;
}

export async function createProject(
  profile: Profile,
  input: CreateProjectInput
): Promise<Project> {
  if (isDemoMode()) {
    const store = demoDb();
    const customer: Customer = {
      id: demoId(),
      company_id: profile.company_id,
      name: input.customerName,
      email: input.customerEmail,
      company_name: input.customerCompany || null,
    };
    store.customers.push(customer);
    const project: Project = {
      id: demoId(),
      company_id: profile.company_id,
      name: input.name,
      job_number: input.jobNumber || null,
      customer_id: customer.id,
      designer_id: profile.id,
      due_date: input.dueDate || null,
      status: "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.projects.unshift(project);
    await logActivity(project.id, "employee", profile.full_name, "project_created");
    return project;
  }

  const supabase = await db();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      company_id: profile.company_id,
      name: input.customerName,
      email: input.customerEmail,
      company_name: input.customerCompany || null,
    })
    .select()
    .single();
  if (customerError) throw new Error(customerError.message);

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      company_id: profile.company_id,
      name: input.name,
      job_number: input.jobNumber || null,
      customer_id: customer.id,
      designer_id: profile.id,
      due_date: input.dueDate || null,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logActivity(project.id, "employee", profile.full_name, "project_created");
  return project;
}

export async function uploadVersion(
  profile: Profile,
  projectId: string,
  file: File,
  revisionNotes: string
): Promise<ProofVersion> {
  const detail = await getProjectDetail(profile, projectId);
  if (!detail) throw new Error("Project not found.");
  const nextNumber = Math.max(0, ...detail.versions.map((v) => v.version_number)) + 1;

  const filePath = await storeFile(
    "proofs",
    [profile.company_id, projectId, `v${nextNumber}`],
    file
  );

  const version: ProofVersion = {
    id: demoId(),
    project_id: projectId,
    version_number: nextNumber,
    file_path: filePath,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: profile.id,
    revision_notes: revisionNotes || null,
    created_at: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoDb().versions.push(version);
  } else {
    const supabase = await db();
    const { data, error } = await supabase
      .from("proof_versions")
      .insert({
        project_id: projectId,
        version_number: nextNumber,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: profile.id,
        revision_notes: revisionNotes || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    version.id = data.id;
  }

  await updateProjectStatus(profile, projectId, "awaiting_review", true);
  await logActivity(
    projectId,
    "employee",
    profile.full_name,
    nextNumber === 1 ? "proof_uploaded" : "version_uploaded",
    { version: nextNumber }
  );

  const token = detail.reviewLinks.find((l) => !l.revoked_at)?.token;
  await notifyCustomer(
    detail.customer,
    nextNumber === 1 ? "proof_ready" : "revision_uploaded",
    {
      projectName: detail.project.name,
      detail: revisionNotes || undefined,
      url: token ? `${appUrl()}/review/${token}` : undefined,
    }
  );

  return version;
}

export async function updateProjectStatus(
  profile: Profile,
  projectId: string,
  status: ProjectStatus,
  silent = false
): Promise<void> {
  if (isDemoMode()) {
    const project = demoDb().projects.find((p) => p.id === projectId);
    if (project) {
      project.status = status;
      project.updated_at = new Date().toISOString();
    }
  } else {
    const supabase = await db();
    await supabase.from("projects").update({ status }).eq("id", projectId);
  }
  void pushProjectStatus(projectId, status);
  if (!silent) {
    await logActivity(projectId, "employee", profile.full_name, "status_changed", { status });
    if (status === "completed") {
      const detail = await getProjectDetail(profile, projectId);
      if (detail) {
        await notifyCustomer(detail.customer, "project_completed", {
          projectName: detail.project.name,
        });
      }
    }
  }
}

export async function createReviewLink(
  profile: Profile,
  projectId: string,
  expiresInDays: number | null
): Promise<ReviewLink> {
  const token = randomBytes(24).toString("base64url");
  const link: ReviewLink = {
    id: demoId(),
    project_id: projectId,
    customer_id: null,
    token,
    expires_at: expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
      : null,
    revoked_at: null,
    created_at: new Date().toISOString(),
  };

  if (isDemoMode()) {
    const store = demoDb();
    const project = store.projects.find((p) => p.id === projectId);
    link.customer_id = project?.customer_id ?? null;
    store.reviewLinks.push(link);
  } else {
    const supabase = await db();
    const { data: project } = await supabase
      .from("projects")
      .select("customer_id")
      .eq("id", projectId)
      .single();
    const { data, error } = await supabase
      .from("review_links")
      .insert({
        project_id: projectId,
        customer_id: project?.customer_id ?? null,
        token,
        expires_at: link.expires_at,
        created_by: profile.id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    link.id = data.id;
  }

  await logActivity(projectId, "employee", profile.full_name, "review_link_created");
  return link;
}

export async function addEmployeeComment(
  profile: Profile,
  projectId: string,
  body: string,
  isInternal: boolean
): Promise<Comment> {
  const comment: Comment = {
    id: demoId(),
    project_id: projectId,
    author_type: "employee",
    author_id: profile.id,
    author_name: profile.full_name,
    body,
    is_internal: isInternal,
    created_at: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoDb().comments.push(comment);
  } else {
    const supabase = await db();
    const { data, error } = await supabase
      .from("comments")
      .insert({
        project_id: projectId,
        author_type: "employee",
        author_id: profile.id,
        author_name: profile.full_name,
        body,
        is_internal: isInternal,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    comment.id = data.id;
  }

  if (!isInternal) {
    await logActivity(projectId, "employee", profile.full_name, "employee_reply", {
      preview: body.slice(0, 120),
    });
    const detail = await getProjectDetail(profile, projectId);
    if (detail) {
      const token = detail.reviewLinks.find((l) => !l.revoked_at)?.token;
      await notifyCustomer(detail.customer, "designer_replied", {
        projectName: detail.project.name,
        detail: body.slice(0, 300),
        url: token ? `${appUrl()}/review/${token}` : undefined,
      });
    }
    void pushComment(projectId, profile.full_name, body);
  }

  return comment;
}

export async function listNotifications(profile: Profile) {
  if (isDemoMode()) {
    return demoDb()
      .notifications.filter((n) => n.recipient_id === profile.id)
      .slice(0, 30);
  }
  const supabase = await db();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Checklist administration
// ---------------------------------------------------------------------------

export async function listChecklistItems(profile: Profile): Promise<ChecklistItem[]> {
  if (isDemoMode()) {
    return demoDb()
      .checklistItems.filter((i) => i.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  const supabase = await db();
  const { data } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function addChecklistItem(profile: Profile, label: string): Promise<ChecklistItem> {
  const items = await listChecklistItems(profile);
  const item: ChecklistItem = {
    id: demoId(),
    company_id: profile.company_id,
    label,
    sort_order: items.length,
    is_active: true,
  };
  if (isDemoMode()) {
    demoDb().checklistItems.push(item);
    return item;
  }
  const supabase = await db();
  const { data, error } = await supabase
    .from("checklist_items")
    .insert({ company_id: profile.company_id, label, sort_order: items.length })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function renameChecklistItem(
  profile: Profile,
  itemId: string,
  label: string
): Promise<void> {
  if (isDemoMode()) {
    const item = demoDb().checklistItems.find((i) => i.id === itemId);
    if (item) item.label = label;
    return;
  }
  const supabase = await db();
  await supabase
    .from("checklist_items")
    .update({ label })
    .eq("id", itemId)
    .eq("company_id", profile.company_id);
}

export async function removeChecklistItem(profile: Profile, itemId: string): Promise<void> {
  // Soft delete: historical checklist_responses keep referencing the item.
  if (isDemoMode()) {
    const item = demoDb().checklistItems.find((i) => i.id === itemId);
    if (item) item.is_active = false;
    return;
  }
  const supabase = await db();
  await supabase
    .from("checklist_items")
    .update({ is_active: false })
    .eq("id", itemId)
    .eq("company_id", profile.company_id);
}

export async function reorderChecklistItems(
  profile: Profile,
  orderedIds: string[]
): Promise<void> {
  if (isDemoMode()) {
    const store = demoDb();
    orderedIds.forEach((id, index) => {
      const item = store.checklistItems.find((i) => i.id === id);
      if (item) item.sort_order = index;
    });
    return;
  }
  const supabase = await db();
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("checklist_items")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("company_id", profile.company_id)
    )
  );
}
