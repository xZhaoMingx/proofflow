"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateStatusAction } from "@/app/(dashboard)/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/types";

export function StatusSelect({
  projectId,
  status,
  onDone,
}: {
  projectId: string;
  status: ProjectStatus;
  /** Called after a status change, so hosts outside the dashboard can refresh. */
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(value) =>
        startTransition(async () => {
          const result = await updateStatusAction(projectId, value as ProjectStatus);
          if (result.ok) onDone?.();
          else toast.error(result.error);
        })
      }
    >
      <SelectTrigger className="w-48" aria-label="Project status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((value) => (
          <SelectItem key={value} value={value}>
            {STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
