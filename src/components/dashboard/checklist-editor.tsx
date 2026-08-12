"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addChecklistItemAction,
  removeChecklistItemAction,
  renameChecklistItemAction,
  reorderChecklistItemsAction,
} from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ChecklistItem } from "@/lib/types";

export function ChecklistEditor({ items }: { items: ChecklistItem[] }) {
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.error) toast.error(result.error);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    run(() => reorderChecklistItemsAction(next.map((i) => i.id)));
  }


  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          >
            {editingId === item.id ? (
              <>
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEditingId(null);
                      run(() => renameChecklistItemAction(item.id, editLabel));
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Save name"
                  onClick={() => {
                    setEditingId(null);
                    run(() => renameChecklistItemAction(item.id, editLabel));
                  }}
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Cancel rename"
                  onClick={() => setEditingId(null)}
                >
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1">{item.label}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={`Move ${item.label} up`}
                  disabled={index === 0 || pending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={`Move ${item.label} down`}
                  disabled={index === items.length - 1 || pending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={`Rename ${item.label}`}
                  disabled={pending}
                  onClick={() => {
                    setEditingId(item.id);
                    setEditLabel(item.label);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-red-500 hover:text-red-600"
                  aria-label={`Remove ${item.label}`}
                  disabled={pending}
                  onClick={() => run(() => removeChecklistItemAction(item.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newLabel.trim()) return;
            setNewLabel("");
            run(() => addChecklistItemAction(newLabel.trim()));
          }}
        >
          <Input
            placeholder="Add a checklist item (e.g. Bleed area)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Button type="submit" disabled={!newLabel.trim() || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
