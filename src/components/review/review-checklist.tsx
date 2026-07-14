"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ChecklistItem, ChecklistResponse } from "@/lib/types";

interface ReviewChecklistProps {
  token: string;
  items: ChecklistItem[];
  responses: ChecklistResponse[];
  versionId: string;
  disabled: boolean;
}

export function ReviewChecklist({
  token,
  items,
  responses,
  versionId,
  disabled,
}: ReviewChecklistProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(
    new Map(responses.map((r) => [r.checklist_item_id, r.checked])),
    (state, update: { itemId: string; checked: boolean }) => {
      const next = new Map(state);
      next.set(update.itemId, update.checked);
      return next;
    }
  );

  const checkedCount = items.filter((i) => optimisticChecked.get(i.id)).length;

  const toggle = (itemId: string, checked: boolean) => {
    startTransition(async () => {
      setOptimisticChecked({ itemId, checked });
      const res = await fetch(`/api/review/${token}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, itemId, checked }),
      }).catch(() => null);
      if (!res?.ok) {
        toast.error("Couldn't save your checklist — please try again.");
        return;
      }
      // Refresh the server snapshot inside the transition so the optimistic
      // value holds until the new state arrives (otherwise it reverts).
      router.refresh();
    });
  };

  if (items.length === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <ListChecks className="size-4" />
            If everything looks right, check each item
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {checkedCount}/{items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {items.map((item) => {
          const checked = optimisticChecked.get(item.id) ?? false;
          return (
            <Label
              key={item.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-normal transition-colors hover:bg-muted has-disabled:cursor-default has-disabled:opacity-70"
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => toggle(item.id, value === true)}
              />
              {item.label}
            </Label>
          );
        })}
      </CardContent>
    </Card>
  );
}
