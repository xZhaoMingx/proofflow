import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { getConnection } from "@/lib/data/clickup";
import { ClickUpSettingsForm } from "@/components/dashboard/clickup-settings-form";

export const metadata = { title: "ClickUp settings" };
export const dynamic = "force-dynamic";

export default async function ClickUpSettingsPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const connection = await getConnection(profile);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">ClickUp integration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your workspace so project status, due dates, and updates stay in sync.
          ProofFlow keeps working even when ClickUp is unavailable.
        </p>
      </div>
      <ClickUpSettingsForm
        isAdmin={profile.role === "admin"}
        connection={
          connection
            ? {
                workspaceId: connection.workspace_id,
                spaceId: connection.space_id ?? "",
                folderId: connection.folder_id ?? "",
                listId: connection.list_id ?? "",
                syncStatus: connection.sync_settings.sync_status !== false,
                syncDueDate: connection.sync_settings.sync_due_date !== false,
                syncComments: connection.sync_settings.sync_comments === true,
                syncAttachments: connection.sync_settings.sync_attachments === true,
              }
            : null
        }
      />
    </div>
  );
}
