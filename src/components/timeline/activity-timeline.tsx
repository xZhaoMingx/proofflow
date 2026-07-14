import { format } from "date-fns";
import {
  CheckCircle2,
  Eye,
  FilePlus2,
  FolderPlus,
  History,
  Link2,
  MessageSquare,
  RefreshCw,
  Reply,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityAction, ActivityEvent } from "@/lib/types";

const ACTION_META: Record<ActivityAction, { label: string; icon: React.ReactNode }> = {
  project_created: { label: "created the project", icon: <FolderPlus className="size-3.5" /> },
  proof_uploaded: { label: "uploaded the first proof", icon: <FilePlus2 className="size-3.5" /> },
  proof_viewed: { label: "viewed the proof", icon: <Eye className="size-3.5" /> },
  comment_added: { label: "commented", icon: <MessageSquare className="size-3.5" /> },
  revision_requested: { label: "requested changes", icon: <Undo2 className="size-3.5" /> },
  version_uploaded: { label: "uploaded a new version", icon: <FilePlus2 className="size-3.5" /> },
  proof_approved: { label: "approved the proof", icon: <CheckCircle2 className="size-3.5" /> },
  employee_reply: { label: "replied", icon: <Reply className="size-3.5" /> },
  status_changed: { label: "changed the status", icon: <RefreshCw className="size-3.5" /> },
  review_link_created: { label: "created a review link", icon: <Link2 className="size-3.5" /> },
  clickup_synced: { label: "synced with ClickUp", icon: <RefreshCw className="size-3.5" /> },
};

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  const ordered = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4" /> Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative ml-2.5 flex flex-col gap-4 border-l pl-5">
            {ordered.map((event) => {
              const meta = ACTION_META[event.action];
              const version =
                typeof event.metadata?.version === "number"
                  ? ` (version ${event.metadata.version})`
                  : "";
              return (
                <li key={event.id} className="relative text-sm">
                  <span className="absolute -left-[27.5px] top-0.5 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground">
                    {meta.icon}
                  </span>
                  <p>
                    <span className="font-medium">{event.actor_name}</span>{" "}
                    <span className="text-muted-foreground">
                      {meta.label}
                      {version}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(event.created_at), "d MMM yyyy, h:mm a")}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
