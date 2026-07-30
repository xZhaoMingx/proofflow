"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { Loader2, Lock, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { addEmployeeCommentAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Comment } from "@/lib/types";

/**
 * Employee-side conversation card: the customer-visible thread and the
 * employees-only internal notes, in separate tabs. Internal notes are never
 * exposed to customers (enforced by RLS / the review data layer).
 */
export function TeamThreadCard({
  projectId,
  comments,
  profileId,
}: {
  projectId: string;
  comments: Comment[];
  profileId: string;
}) {
  const [tab, setTab] = useState<"customer" | "internal">("customer");
  const [thread, setThread] = useState<Comment[]>(comments);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  // Poll so the customer's messages show up here without refreshing the page.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { comments?: Comment[] };
      if (data.comments) setThread(data.comments);
    } catch {
      // Transient network hiccup; the next tick retries.
    }
  }, [projectId]);

  useEffect(() => {
    // Initial messages come from server-rendered props; poll for new ones.
    const interval = setInterval(refetch, 4000);
    return () => clearInterval(interval);
  }, [refetch]);

  const visible = thread.filter((c) => (tab === "internal" ? c.is_internal : !c.is_internal));

  function submit() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addEmployeeCommentAction(projectId, text, tab === "internal");
      if (result.ok) {
        setBody("");
        await refetch(); // Show the sent reply immediately.
        if (tab === "customer") toast.success("Reply sent — the customer has been notified.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <MessageSquare className="size-4" /> Conversation
          </span>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="h-8">
              <TabsTrigger value="customer" className="text-xs">
                Customer thread
              </TabsTrigger>
              <TabsTrigger value="internal" className="text-xs">
                <Lock className="size-3" /> Internal notes
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tab === "internal" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Internal notes are only visible to your team — customers never see this tab.
          </p>
        )}
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
          {visible.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {tab === "internal" ? "No internal notes yet." : "No messages yet."}
            </p>
          )}
          {visible.map((comment) => {
            const mine = comment.author_id === profileId;
            return (
              <div
                key={comment.id}
                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                    comment.is_internal
                      ? "border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50"
                      : mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted"
                  )}
                >
                  <p
                    className={cn(
                      "mb-0.5 text-xs font-semibold",
                      comment.is_internal && "text-amber-800 dark:text-amber-300"
                    )}
                  >
                    {comment.author_name}
                    {comment.author_type === "customer" && " (customer)"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                </div>
                <span className="mt-1 px-1 text-[11px] text-muted-foreground">
                  {format(new Date(comment.created_at), "d MMM, h:mm a")}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            placeholder={
              tab === "internal"
                ? "Add an internal note (e.g. waiting on customer, material changed)…"
                : "Reply to the customer…"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-0 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button size="icon" onClick={submit} disabled={!body.trim() || pending} aria-label="Send">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
