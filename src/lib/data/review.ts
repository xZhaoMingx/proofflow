import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoDb, demoId } from "@/lib/data/demo-store";
import { findProfile } from "@/lib/data/accounts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyEmployees } from "@/lib/notifications";
import { storeFile } from "@/lib/storage";
import { pushProjectStatus, sendSubmissionToClickUp } from "@/services/clickup/sync";
import type {
  ActivityAction,
  ActivityEvent,
  Approval,
  Attachment,
  AuthorType,
  ChangeRequest,
  Comment,
  ProjectStatus,
  ReviewContext,
  ReviewLink,
} from "@/lib/types";

/**
 * Customer-side data access. Customers authenticate with a review-link token,
 * not a Supabase session, so every function here first validates the token
 * and then uses the service-role client scoped to that link's project.
 */

export class ReviewLinkError extends Error {
  constructor(public reason: "not_found" | "expired" | "revoked") {
    super(`Review link ${reason}`);
  }
}

interface ValidatedLink {
  link: ReviewLink;
  projectId: string;
  companyId: string;
}

export async function validateToken(token: string): Promise<ValidatedLink> {
  let link: ReviewLink | undefined;
  let companyId: string | undefined;

  if (isDemoMode()) {
    const db = demoDb();
    link = db.reviewLinks.find((l) => l.token === token);
    companyId = db.company.id;
  } else {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("review_links")
      .select("*, projects!inner(company_id)")
      .eq("token", token)
      .maybeSingle();
    if (data) {
      const { projects, ...rest } = data as ReviewLink & {
        projects: { company_id: string };
      };
      link = rest;
      companyId = projects.company_id;
    }
  }

  if (!link || !companyId) throw new ReviewLinkError("not_found");
  if (link.revoked_at) throw new ReviewLinkError("revoked");
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw new ReviewLinkError("expired");
  }
  return { link, projectId: link.project_id, companyId };
}

export async function getReviewContext(token: string): Promise<ReviewContext> {
  const { link, projectId } = await validateToken(token);

  if (isDemoMode()) {
    const db = demoDb();
    const project = db.projects.find((p) => p.id === projectId)!;
    return {
      company: db.company,
      project,
      customer: db.customers.find((c) => c.id === link.customer_id) ?? null,
      designer: (() => {
        const p = project.designer_id ? findProfile(project.designer_id) : null;
        return p ? { id: p.id, full_name: p.full_name } : null;
      })(),
      versions: db.versions
        .filter((v) => v.project_id === projectId)
        .sort((a, b) => a.version_number - b.version_number),
      checklistItems: db.checklistItems
        .filter((i) => i.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
      checklistResponses: db.checklistResponses.filter((r) => r.project_id === projectId),
      comments: db.comments
        .filter((c) => c.project_id === projectId && !c.is_internal)
        .map((c) => ({
          ...c,
          attachments: db.attachments.filter(
            (a) => a.parent_type === "comment" && a.parent_id === c.id
          ),
          read_by: db.commentReads
            .filter((r) => r.comment_id === c.id)
            .map((r) => r.reader_key),
        }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      activity: db.activity
        .filter((a) => a.project_id === projectId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      approval:
        db.approvals
          .filter((a) => a.project_id === projectId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
      changeRequests: db.changeRequests.filter((r) => r.project_id === projectId),
    };
  }

  const supabase = createSupabaseAdminClient();
  const [
    { data: project },
    { data: versions },
    { data: comments },
    { data: activity },
    { data: approvals },
    { data: changeRequests },
    { data: responses },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*, companies(*), customers(*), profiles:designer_id(id, full_name)")
      .eq("id", projectId)
      .single(),
    supabase
      .from("proof_versions")
      .select("*")
      .eq("project_id", projectId)
      .order("version_number"),
    supabase
      .from("comments")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_internal", false)
      .order("created_at"),
    supabase
      .from("activity_events")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
    supabase
      .from("approvals")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("change_requests").select("*").eq("project_id", projectId),
    supabase.from("checklist_responses").select("*").eq("project_id", projectId),
  ]);

  if (!project) throw new ReviewLinkError("not_found");

  const { companies, customers, profiles, ...projectRow } = project;

  const commentIds = (comments ?? []).map((c) => c.id);
  let attachments: Attachment[] = [];
  let reads: { comment_id: string; reader_key: string }[] = [];
  if (commentIds.length) {
    const [{ data: att }, { data: rd }] = await Promise.all([
      supabase
        .from("attachments")
        .select("*")
        .eq("parent_type", "comment")
        .in("parent_id", commentIds),
      supabase.from("comment_reads").select("comment_id, reader_key").in("comment_id", commentIds),
    ]);
    attachments = att ?? [];
    reads = rd ?? [];
  }

  const { data: checklistItems } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("company_id", companies.id)
    .eq("is_active", true)
    .order("sort_order");

  return {
    company: companies,
    project: projectRow,
    customer: customers ?? null,
    designer: profiles ?? null,
    versions: versions ?? [],
    checklistItems: checklistItems ?? [],
    checklistResponses: responses ?? [],
    comments: (comments ?? []).map((c) => ({
      ...c,
      attachments: attachments.filter((a) => a.parent_id === c.id),
      read_by: reads.filter((r) => r.comment_id === c.id).map((r) => r.reader_key),
    })),
    activity: activity ?? [],
    approval: approvals?.[0] ?? null,
    changeRequests: changeRequests ?? [],
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function logActivity(
  projectId: string,
  actorType: AuthorType,
  actorName: string,
  action: ActivityAction,
  metadata: Record<string, unknown> = {}
): Promise<ActivityEvent> {
  const event: ActivityEvent = {
    id: demoId(),
    project_id: projectId,
    actor_type: actorType,
    actor_name: actorName,
    action,
    metadata,
    created_at: new Date().toISOString(),
  };
  if (isDemoMode()) {
    demoDb().activity.push(event);
  } else {
    const supabase = createSupabaseAdminClient();
    await supabase.from("activity_events").insert({
      project_id: projectId,
      actor_type: actorType,
      actor_name: actorName,
      action,
      metadata,
    });
  }
  return event;
}

async function setProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
  if (isDemoMode()) {
    const project = demoDb().projects.find((p) => p.id === projectId);
    if (project) {
      project.status = status;
      project.updated_at = new Date().toISOString();
    }
  } else {
    const supabase = createSupabaseAdminClient();
    await supabase.from("projects").update({ status }).eq("id", projectId);
  }
  // Fire-and-forget: ClickUp being down must never block the review workflow.
  void pushProjectStatus(projectId, status);
}

// ---------------------------------------------------------------------------
// Customer actions
// ---------------------------------------------------------------------------

export async function recordProofViewed(token: string, versionNumber: number): Promise<void> {
  const { link, projectId, companyId } = await validateToken(token);
  const ctx = await getReviewContext(token);
  const viewerName = ctx.customer?.name ?? "Customer";

  // Only log the first view per version to avoid noise.
  const alreadyViewed = ctx.activity.some(
    (a) => a.action === "proof_viewed" && a.metadata.version === versionNumber
  );
  if (alreadyViewed) return;

  await logActivity(projectId, "customer", viewerName, "proof_viewed", {
    version: versionNumber,
    link_id: link.id,
  });
  await notifyEmployees(companyId, "proof_viewed", {
    projectName: ctx.project.name,
    detail: `${viewerName} viewed version ${versionNumber}.`,
  });
}

export async function setChecklistResponse(
  token: string,
  input: { versionId: string; itemId: string; checked: boolean }
): Promise<void> {
  const { projectId } = await validateToken(token);
  const ctx = await getReviewContext(token);
  const respondedBy = ctx.customer?.name ?? "Customer";

  if (isDemoMode()) {
    const db = demoDb();
    const existing = db.checklistResponses.find(
      (r) => r.proof_version_id === input.versionId && r.checklist_item_id === input.itemId
    );
    if (existing) {
      existing.checked = input.checked;
    } else {
      db.checklistResponses.push({
        id: demoId(),
        project_id: projectId,
        proof_version_id: input.versionId,
        checklist_item_id: input.itemId,
        checked: input.checked,
        responded_by: respondedBy,
      });
    }
    return;
  }

  const supabase = createSupabaseAdminClient();
  await supabase.from("checklist_responses").upsert(
    {
      project_id: projectId,
      proof_version_id: input.versionId,
      checklist_item_id: input.itemId,
      checked: input.checked,
      responded_by: respondedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "proof_version_id,checklist_item_id" }
  );
}

export interface ApproveInput {
  versionId: string;
  comment: string;
  checklist: { label: string; checked: boolean }[];
  browser: string;
  device: string;
  ipAddress: string | null;
}

export async function approveProof(token: string, input: ApproveInput): Promise<Approval> {
  const { projectId, companyId } = await validateToken(token);
  const ctx = await getReviewContext(token);
  const customerName = ctx.customer?.name ?? "Customer";
  const customerEmail = ctx.customer?.email ?? "";
  const captureIp = ctx.company.settings.capture_ip === true;

  const approval: Approval = {
    id: demoId(),
    project_id: projectId,
    proof_version_id: input.versionId,
    customer_name: customerName,
    customer_email: customerEmail,
    comment: input.comment || null,
    checklist_snapshot: input.checklist,
    browser: input.browser,
    device: input.device,
    ip_address: captureIp ? input.ipAddress : null,
    created_at: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoDb().approvals.push(approval);
  } else {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("approvals").insert({
      project_id: approval.project_id,
      proof_version_id: approval.proof_version_id,
      customer_name: approval.customer_name,
      customer_email: approval.customer_email,
      comment: approval.comment,
      checklist_snapshot: approval.checklist_snapshot,
      browser: approval.browser,
      device: approval.device,
      ip_address: approval.ip_address,
    });
    if (error) throw new Error(`Could not record approval: ${error.message}`);
  }

  await setProjectStatus(projectId, "approved");
  const version = ctx.versions.find((v) => v.id === input.versionId);
  await logActivity(projectId, "customer", customerName, "proof_approved", {
    version: version?.version_number,
    comment: input.comment || undefined,
  });
  await notifyEmployees(companyId, "proof_approved", {
    projectName: ctx.project.name,
    detail: `${customerName} approved version ${version?.version_number}.${
      input.comment ? ` Comment: "${input.comment}"` : ""
    }`,
  });
  // Fire-and-forget: the submission also lands as a task in ClickUp.
  void sendSubmissionToClickUp(projectId, {
    kind: "approved",
    projectName: ctx.project.name,
    customerName,
    customerEmail,
    versionNumber: version?.version_number,
    comment: input.comment,
    checklist: input.checklist,
  });

  return approval;
}

export interface RequestChangesInput {
  versionId: string;
  comment: string;
  files: File[];
}

export async function requestChanges(
  token: string,
  input: RequestChangesInput
): Promise<ChangeRequest> {
  const { projectId, companyId } = await validateToken(token);
  const ctx = await getReviewContext(token);
  const customerName = ctx.customer?.name ?? "Customer";
  const customerEmail = ctx.customer?.email ?? "";

  const request: ChangeRequest = {
    id: demoId(),
    project_id: projectId,
    proof_version_id: input.versionId,
    comment: input.comment,
    requested_by_name: customerName,
    requested_by_email: customerEmail,
    created_at: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoDb().changeRequests.push(request);
  } else {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("change_requests")
      .insert({
        project_id: request.project_id,
        proof_version_id: request.proof_version_id,
        comment: request.comment,
        requested_by_name: request.requested_by_name,
        requested_by_email: request.requested_by_email,
      })
      .select()
      .single();
    if (error) throw new Error(`Could not record change request: ${error.message}`);
    request.id = data.id;
  }

  // The change request also lands in the conversation thread with attachments.
  await addCustomerComment(token, { body: input.comment, files: input.files }, true);

  await setProjectStatus(projectId, "revision_requested");
  const version = ctx.versions.find((v) => v.id === input.versionId);
  await logActivity(projectId, "customer", customerName, "revision_requested", {
    version: version?.version_number,
  });
  await notifyEmployees(companyId, "revision_requested", {
    projectName: ctx.project.name,
    detail: `${customerName} requested changes on version ${version?.version_number}: "${input.comment.slice(0, 200)}"`,
  });
  void sendSubmissionToClickUp(projectId, {
    kind: "changes_requested",
    projectName: ctx.project.name,
    customerName,
    customerEmail,
    versionNumber: version?.version_number,
    comment: input.comment,
  });

  return request;
}

export async function addCustomerComment(
  token: string,
  input: { body: string; files: File[] },
  silent = false
): Promise<Comment> {
  const { projectId, companyId } = await validateToken(token);
  const ctx = await getReviewContext(token);
  const customerName = ctx.customer?.name ?? "Customer";

  let commentId = demoId();

  if (isDemoMode()) {
    demoDb().comments.push({
      id: commentId,
      project_id: projectId,
      author_type: "customer",
      author_id: null,
      author_name: customerName,
      body: input.body,
      is_internal: false,
      created_at: new Date().toISOString(),
    });
  } else {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({
        project_id: projectId,
        author_type: "customer",
        author_name: customerName,
        body: input.body,
        is_internal: false,
      })
      .select()
      .single();
    if (error) throw new Error(`Could not add comment: ${error.message}`);
    commentId = data.id;
  }

  const attachments: Attachment[] = [];
  for (const file of input.files) {
    const filePath = await storeFile("attachments", [companyId, projectId, commentId], file);
    const attachment: Attachment = {
      id: demoId(),
      company_id: companyId,
      parent_type: "comment",
      parent_id: commentId,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      created_at: new Date().toISOString(),
    };
    if (isDemoMode()) {
      demoDb().attachments.push(attachment);
    } else {
      const supabase = createSupabaseAdminClient();
      await supabase.from("attachments").insert({
        company_id: attachment.company_id,
        parent_type: attachment.parent_type,
        parent_id: attachment.parent_id,
        file_path: attachment.file_path,
        file_name: attachment.file_name,
        file_type: attachment.file_type,
        file_size: attachment.file_size,
      });
    }
    attachments.push(attachment);
  }

  if (!silent) {
    await logActivity(projectId, "customer", customerName, "comment_added", {
      preview: input.body.slice(0, 120),
    });
    await notifyEmployees(companyId, "comment_added", {
      projectName: ctx.project.name,
      detail: `${customerName}: "${input.body.slice(0, 200)}"`,
    });
  }

  return {
    id: commentId,
    project_id: projectId,
    author_type: "customer",
    author_id: null,
    author_name: customerName,
    body: input.body,
    is_internal: false,
    created_at: new Date().toISOString(),
    attachments,
  };
}

/** Mark customer-visible employee comments as read by this review link. */
export async function markCommentsRead(token: string): Promise<void> {
  const { link, projectId } = await validateToken(token);
  const readerKey = `link:${link.id}`;

  if (isDemoMode()) {
    const db = demoDb();
    for (const comment of db.comments) {
      if (
        comment.project_id === projectId &&
        !comment.is_internal &&
        comment.author_type === "employee" &&
        !db.commentReads.some((r) => r.comment_id === comment.id && r.reader_key === readerKey)
      ) {
        db.commentReads.push({
          comment_id: comment.id,
          reader_key: readerKey,
          read_at: new Date().toISOString(),
        });
      }
    }
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: comments } = await supabase
    .from("comments")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_internal", false)
    .eq("author_type", "employee");
  if (!comments?.length) return;
  await supabase.from("comment_reads").upsert(
    comments.map((c) => ({ comment_id: c.id, reader_key: readerKey })),
    { onConflict: "comment_id,reader_key", ignoreDuplicates: true }
  );
}
