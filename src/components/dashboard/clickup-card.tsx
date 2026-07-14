"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ExternalLink, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { linkClickUpTaskAction, syncClickUpNowAction } from "@/app/(dashboard)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ClickUpTaskLink } from "@/lib/types";

export function ClickUpCard({
  projectId,
  link,
}: {
  projectId: string;
  link: ClickUpTaskLink | null;
}) {
  const [taskId, setTaskId] = useState("");
  const [pending, startTransition] = useTransition();

  function linkTask() {
    startTransition(async () => {
      const result = await linkClickUpTaskAction(projectId, taskId);
      if (result.ok) {
        setTaskId("");
        toast.success("ClickUp task linked.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function syncNow() {
    startTransition(async () => {
      const result = await syncClickUpNowAction(projectId);
      if (result.ok) toast.success("Synced with ClickUp.");
      else toast.error(result.error);
    });
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
            <path d="M4 17.4 7 15c1.3 1.7 2.9 2.5 5 2.5s3.7-.8 5-2.5l3 2.4c-1.9 2.5-4.6 3.9-8 3.9s-6.1-1.4-8-3.9ZM12 7.2 6.7 11 4.5 8 12 2.7 19.5 8l-2.2 3L12 7.2Z" />
          </svg>
          ClickUp
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {link ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Task status</dt>
                <dd className="mt-0.5 font-medium capitalize">
                  {link.clickup_status ?? "Not synced yet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assignee</dt>
                <dd className="mt-0.5 font-medium">{link.clickup_assignee ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Last sync</dt>
                <dd className="mt-0.5 text-sm">
                  {link.last_synced_at
                    ? formatDistanceToNow(new Date(link.last_synced_at), { addSuffix: true })
                    : "Never"}
                </dd>
              </div>
            </dl>
            {link.sync_error && (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Sync pending — last attempt failed: {link.sync_error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={link.task_url ?? "#"} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" /> Open in ClickUp
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={syncNow} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Sync now
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Link a ClickUp task to keep status and updates in sync. Configure the workspace
              connection under Settings → ClickUp.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="ClickUp task ID (e.g. 86dq1abcd)"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
              />
              <Button onClick={linkTask} disabled={!taskId.trim() || pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                Link
              </Button>
            </div>
            <Badge variant="outline" className="self-start text-xs font-normal text-muted-foreground">
              ProofFlow keeps working even if ClickUp is down
            </Badge>
          </>
        )}
      </CardContent>
    </Card>
  );
}
