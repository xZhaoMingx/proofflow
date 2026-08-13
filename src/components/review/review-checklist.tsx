"use client";

import { ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ChecklistItem } from "@/lib/types";

interface ReviewChecklistProps {
  items: ChecklistItem[];
  checkedMap: Map<string, boolean>;
  onToggle: (itemId: string, checked: boolean) => void;
  disabled: boolean;
}

/**
 * Controlled checklist. The checked state lives in ReviewShell and is shared
 * with the approve button, so ticking an item updates instantly with no page
 * refresh (which used to make the whole review page flicker on every click).
 */
export function ReviewChecklist({ items, checkedMap, onToggle, disabled }: ReviewChecklistProps) {
  if (items.length === 0) return null;

  const checkedCount = items.filter((i) => checkedMap.get(i.id)).length;

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
          const checked = checkedMap.get(item.id) ?? false;
          return (
            <Label
              key={item.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-normal transition-colors hover:bg-muted has-disabled:cursor-default has-disabled:opacity-70"
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => onToggle(item.id, value === true)}
              />
              {item.label}
            </Label>
          );
        })}
      </CardContent>
    </Card>
  );
}
