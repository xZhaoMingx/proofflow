"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveClickUpAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface ConnectionValues {
  workspaceId: string;
  spaceId: string;
  folderId: string;
  listId: string;
  syncStatus: boolean;
  syncDueDate: boolean;
  syncComments: boolean;
  syncAttachments: boolean;
}

export function ClickUpSettingsForm({
  connection,
  isAdmin,
}: {
  connection: ConnectionValues | null;
  isAdmin: boolean;
}) {
  const [values, setValues] = useState<ConnectionValues>(
    connection ?? {
      workspaceId: "",
      spaceId: "",
      folderId: "",
      listId: "",
      syncStatus: true,
      syncDueDate: true,
      syncComments: false,
      syncAttachments: false,
    }
  );
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await saveClickUpAction({ accessToken, ...values });
    setBusy(false);
    if (result.ok) {
      setAccessToken("");
      toast.success("ClickUp connected — token verified and saved.");
    } else {
      toast.error(result.error);
    }
  }

  const set = <K extends keyof ConnectionValues>(key: K, value: ConnectionValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const toggles: { key: keyof ConnectionValues; label: string; hint: string }[] = [
    { key: "syncStatus", label: "Sync status", hint: "Push ProofFlow status changes to the task" },
    { key: "syncDueDate", label: "Sync due date", hint: "Keep task due dates aligned" },
    { key: "syncComments", label: "Sync comments", hint: "Mirror customer-visible replies as task comments" },
    { key: "syncAttachments", label: "Sync attachments", hint: "Copy customer attachments to the task" },
  ];

  return (
    <Card className="rounded-2xl">
      <CardContent>
        {connection && (
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-4" /> Connected to workspace {connection.workspaceId}
          </p>
        )}
        {!isAdmin ? (
          <p className="text-sm text-muted-foreground">
            Only admins can change the ClickUp connection.
          </p>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cu-token">Personal API token</Label>
              <Input
                id="cu-token"
                type="password"
                required
                placeholder={connection ? "Enter token again to update settings" : "pk_…"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ClickUp → Settings → Apps. Stored server-side and never sent to the browser.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cu-workspace">Workspace ID</Label>
                <Input
                  id="cu-workspace"
                  required
                  value={values.workspaceId}
                  onChange={(e) => set("workspaceId", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cu-space">Space ID (optional)</Label>
                <Input
                  id="cu-space"
                  value={values.spaceId}
                  onChange={(e) => set("spaceId", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cu-folder">Folder ID (optional)</Label>
                <Input
                  id="cu-folder"
                  value={values.folderId}
                  onChange={(e) => set("folderId", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cu-list">List ID (optional)</Label>
                <Input
                  id="cu-list"
                  value={values.listId}
                  onChange={(e) => set("listId", e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-3">
              {toggles.map((toggle) => (
                <div key={toggle.key} className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor={`toggle-${toggle.key}`}>{toggle.label}</Label>
                    <p className="text-xs text-muted-foreground">{toggle.hint}</p>
                  </div>
                  <Switch
                    id={`toggle-${toggle.key}`}
                    checked={values[toggle.key] as boolean}
                    onCheckedChange={(checked) => set(toggle.key, checked)}
                  />
                </div>
              ))}
            </div>

            <Button type="submit" disabled={busy || !accessToken} className="justify-self-start">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {connection ? "Update connection" : "Connect ClickUp"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
