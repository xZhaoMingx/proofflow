import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { listChecklistItems } from "@/lib/data/projects";
import { ChecklistEditor } from "@/components/dashboard/checklist-editor";

export const metadata = { title: "Checklist settings" };
export const dynamic = "force-dynamic";

export default async function ChecklistSettingsPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const items = await listChecklistItems(profile);
  const isAdmin = profile.role === "admin";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Review checklist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers confirm these items before approving a proof. Changes apply to all new
          reviews for your company.
        </p>
      </div>
      <ChecklistEditor items={items} isAdmin={isAdmin} />
    </div>
  );
}
