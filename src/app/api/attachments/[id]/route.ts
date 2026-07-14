import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { demoDb } from "@/lib/data/demo-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { getAttachmentUrl } from "@/lib/storage";
import { validateToken } from "@/lib/data/review";
import type { Attachment } from "@/lib/types";

/**
 * Resolve an attachment to a signed URL. Access requires either:
 * - a valid review-link token whose project owns the attachment, or
 * - an employee session in the attachment's company.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("token");

  let attachment: Attachment | null = null;
  let parentProjectId: string | null = null;

  if (isDemoMode()) {
    const db = demoDb();
    attachment = db.attachments.find((a) => a.id === id) ?? null;
    if (attachment) {
      parentProjectId =
        attachment.parent_type === "comment"
          ? db.comments.find((c) => c.id === attachment!.parent_id)?.project_id ?? null
          : db.changeRequests.find((r) => r.id === attachment!.parent_id)?.project_id ?? null;
    }
  } else {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.from("attachments").select("*").eq("id", id).maybeSingle();
    attachment = data ?? null;
    if (attachment) {
      const table = attachment.parent_type === "comment" ? "comments" : "change_requests";
      const { data: parent } = await supabase
        .from(table)
        .select("project_id")
        .eq("id", attachment.parent_id)
        .maybeSingle();
      parentProjectId = parent?.project_id ?? null;
    }
  }

  if (!attachment || !parentProjectId) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  let authorized = false;
  if (token) {
    try {
      const { projectId } = await validateToken(token);
      authorized = projectId === parentProjectId;
    } catch {
      authorized = false;
    }
  }
  if (!authorized) {
    const profile = await getSessionProfile();
    authorized = Boolean(profile && profile.company_id === attachment.company_id);
  }
  if (!authorized) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const url = await getAttachmentUrl(attachment);
  return NextResponse.redirect(url.startsWith("/") ? new URL(url, request.url) : url);
}
