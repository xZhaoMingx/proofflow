"use client";

import { format } from "date-fns";
import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProofVersion } from "@/lib/types";

interface VersionHistoryProps {
  versions: ProofVersion[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function VersionHistory({ versions, currentIndex, onSelect }: VersionHistoryProps) {
  const latestNumber = Math.max(...versions.map((v) => v.version_number));

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="size-4" /> Version history
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {[...versions]
          .sort((a, b) => b.version_number - a.version_number)
          .map((version) => {
            const index = versions.findIndex((v) => v.id === version.id);
            const active = index === currentIndex;
            return (
              <button
                key={version.id}
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "hover:bg-muted"
                )}
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Version {version.version_number}</span>
                  {version.version_number === latestNumber && (
                    <Badge variant="secondary">Current</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format(new Date(version.created_at), "d MMM yyyy, h:mm a")}
                </p>
                {version.revision_notes && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {version.revision_notes}
                  </p>
                )}
              </button>
            );
          })}
      </CardContent>
    </Card>
  );
}
