"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getClickUpListsAction, saveClickUpAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

interface ListOption {
  id: string;
  label: string;
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
  const [lists, setLists] = useState<ListOption[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const connected = Boolean(connection);

  async function loadLists() {
    setLoadingLists(true);
    const result = await getClickUpListsAction();
    setLoadingLists(false);
    if (result.ok && result.data) {
      setLists(result.data.lists);
      if (result.data.lists.length === 0) {
        toast.info("No lists found in your ClickUp workspace.");
      }
    } else if (!result.ok) {
      toast.error(result.error);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await saveClickUpAction({ accessToken, ...values });
    setBusy(false);
    if (result.ok) {
      setAccessToken("");
      toast.success("Saved — submissions will go to your chosen list.");
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

  const selectedLabel = lists.find((l) => l.id === values.listId)?.label;

  if (!isAdmin) {
    return (
      <Card className="rounded-2xl">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only admins can change the ClickUp connection.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent>
        {connected && (
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-4" /> Connected to ClickUp
            {connection?.workspaceId ? ` (workspace ${connection.workspaceId})` : ""}. Settings are
            saved and survive restarts.
          </p>
        )}

        <form onSubmit={submit} className="grid gap-5">
          {/* Submissions list — the main control */}
          <div className="grid gap-1.5">
            <Label>Submissions list</Label>
            <p className="text-xs text-muted-foreground">
              Every approval and change request creates a task in this ClickUp list.
            </p>
            <div className="flex gap-2">
              <Select value={values.listId} onValueChange={(v) => set("listId", v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Load your lists, then choose one" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={loadLists} disabled={loadingLists}>
                {loadingLists ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {lists.length ? "Refresh" : "Load my lists"}
              </Button>
            </div>
            {values.listId && (
              <p className="text-xs text-muted-foreground">
                Selected list ID: <span className="font-mono">{values.listId}</span>
                {selectedLabel ? ` — ${selectedLabel}` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to auto-create a list called “ProofFlow”.
            </p>
          </div>

          <Separator />

          {/* Token — optional once .env.local has one */}
          <div className="grid gap-1.5">
            <Label htmlFor="cu-token">
              API token{" "}
              <span className="font-normal text-muted-foreground">
                {connected ? "(already set — leave blank to keep it)" : ""}
              </span>
            </Label>
            <Input
              id="cu-token"
              type="password"
              placeholder={connected ? "Leave blank to keep current token" : "pk_…"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              ClickUp → Settings → Apps. Stored server-side, never sent to the browser.
            </p>
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

          <Button type="submit" disabled={busy} className="justify-self-start">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
