import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/types";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: "bg-muted text-muted-foreground border-transparent",
  awaiting_review:
    "bg-blue-100 text-blue-800 border-transparent dark:bg-blue-950 dark:text-blue-300",
  revision_requested:
    "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  completed:
    "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground border-transparent",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(STATUS_STYLES[status], className)}>{STATUS_LABELS[status]}</Badge>
  );
}
