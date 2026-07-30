"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Check, Copy, Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createReviewLinkAction } from "@/app/(dashboard)/actions";
import { REVIEW_LINK_DAYS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReviewLink } from "@/lib/types";

export function ReviewLinksCard({
  projectId,
  links,
  onDone,
}: {
  projectId: string;
  links: ReviewLink[];
  /** Called after a link is created, so hosts outside the dashboard can refresh. */
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeLinks = links.filter(
    (l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date())
  );

  async function copy(link: ReviewLink) {
    const url = `${window.location.origin}/review/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    toast.success("Review link copied — send it to your customer.");
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Link2 className="size-4" /> Review links
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createReviewLinkAction(projectId, REVIEW_LINK_DAYS);
                if (result.ok) {
                  toast.success(`New ${REVIEW_LINK_DAYS}-day review link created.`);
                  onDone?.();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            New link
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {activeLinks.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No active links. Create one to let the customer review this proof — no account
            needed on their side.
          </p>
        ) : (
          activeLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">/review/{link.token}</p>
                <p className="text-xs text-muted-foreground">
                  {link.expires_at
                    ? `Expires ${format(new Date(link.expires_at), "d MMM yyyy")}`
                    : "Never expires"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">Active</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Copy review link"
                  onClick={() => copy(link)}
                >
                  {copiedId === link.id ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
