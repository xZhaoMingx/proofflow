import "server-only";
import { isDemoMode } from "@/lib/env";
import { demoDb, demoId } from "@/lib/data/demo-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Customer, NotificationType } from "@/lib/types";

/**
 * Notification service. Every event writes an in-app notification row;
 * email is dispatched when RESEND_API_KEY is configured. SMS/push can be
 * added later as additional channels behind the same two entry points.
 */

const SUBJECTS: Record<NotificationType, string> = {
  proof_viewed: "Your proof was viewed",
  proof_approved: "Proof approved 🎉",
  revision_requested: "Changes requested on a proof",
  comment_added: "New comment on a proof",
  version_uploaded: "A new proof version was uploaded",
  proof_ready: "Your proof is ready for review",
  designer_replied: "Your designer replied",
  revision_uploaded: "A revised proof is ready",
  project_completed: "Your project is complete",
};

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "ProofFlow <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
  } catch (err) {
    // Notifications must never break the main workflow.
    console.error("[notifications] email send failed:", err);
  }
}

function emailBody(type: NotificationType, payload: Record<string, unknown>): string {
  const project = typeof payload.projectName === "string" ? payload.projectName : "your project";
  const detail = typeof payload.detail === "string" ? `<p>${payload.detail}</p>` : "";
  const link = typeof payload.url === "string"
    ? `<p><a href="${payload.url}">Open in ProofFlow</a></p>`
    : "";
  return `<div style="font-family:sans-serif"><h2>${SUBJECTS[type]}</h2><p>Project: <strong>${project}</strong></p>${detail}${link}</div>`;
}

/** Notify every employee of a company (in-app + email). */
export async function notifyEmployees(
  companyId: string,
  type: NotificationType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    if (isDemoMode()) {
      const db = demoDb();
      for (const profile of db.profiles) {
        db.notifications.unshift({
          id: demoId(),
          company_id: companyId,
          recipient_id: profile.id,
          customer_id: null,
          type,
          payload,
          read_at: null,
          created_at: new Date().toISOString(),
        });
        await sendEmail(profile.email, SUBJECTS[type], emailBody(type, payload));
      }
      return;
    }

    const supabase = createSupabaseAdminClient();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("company_id", companyId);
    if (!profiles?.length) return;

    await supabase.from("notifications").insert(
      profiles.map((p) => ({
        company_id: companyId,
        recipient_id: p.id,
        type,
        payload,
      }))
    );
    await Promise.all(
      profiles.map((p) => sendEmail(p.email, SUBJECTS[type], emailBody(type, payload)))
    );
  } catch (err) {
    console.error("[notifications] notifyEmployees failed:", err);
  }
}

/** Notify a customer (in-app record + email). */
export async function notifyCustomer(
  customer: Pick<Customer, "id" | "email" | "company_id"> | null,
  type: NotificationType,
  payload: Record<string, unknown>
): Promise<void> {
  if (!customer) return;
  try {
    if (isDemoMode()) {
      demoDb().notifications.unshift({
        id: demoId(),
        company_id: customer.company_id,
        recipient_id: null,
        customer_id: customer.id,
        type,
        payload,
        read_at: null,
        created_at: new Date().toISOString(),
      });
    } else {
      const supabase = createSupabaseAdminClient();
      await supabase.from("notifications").insert({
        company_id: customer.company_id,
        customer_id: customer.id,
        type,
        payload,
      });
    }
    await sendEmail(customer.email, SUBJECTS[type], emailBody(type, payload));
  } catch (err) {
    console.error("[notifications] notifyCustomer failed:", err);
  }
}
