"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCheck, FileText, Loader2, MessageSquare, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_ATTACHMENTS } from "@/lib/types";
import type { Comment } from "@/lib/types";

interface CommentThreadProps {
  token: string;
  comments: Comment[];
  customerName: string;
  onPosted: () => void;
}

function AttachmentChips({ comment, token }: { comment: Comment; token?: string }) {
  if (!comment.attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {comment.attachments.map((att) => (
        <a
          key={att.id}
          href={`/api/attachments/${att.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1 text-xs hover:bg-background"
        >
          <FileText className="size-3.5" />
          <span className="max-w-40 truncate">{att.file_name}</span>
        </a>
      ))}
    </div>
  );
}

export function CommentThread({ token, comments, customerName, onPosted }: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Newest messages appear at the bottom; keep the view pinned there.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [comments.length]);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("body", body);
      files.forEach((file) => form.append("files", file));
      const res = await fetch(`/api/review/${token}/comments`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not post your comment.");
      }
      setBody("");
      setFiles([]);
      onPosted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post your comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4" /> Conversation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
          {comments.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No messages yet — questions and feedback go here.
            </p>
          )}
          {comments.map((comment) => {
            const mine = comment.author_type === "customer";
            const seenByTeam =
              mine && (comment.read_by ?? []).some((key) => !key.startsWith("link:"));
            return (
              <div
                key={comment.id}
                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted"
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 text-xs font-semibold">{comment.author_name}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                  <AttachmentChips comment={comment} token={token} />
                </div>
                <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                  <span>{format(new Date(comment.created_at), "d MMM, h:mm a")}</span>
                  {seenByTeam && (
                    <span className="flex items-center gap-0.5">
                      · <CheckCheck className="size-3" /> Seen
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border p-2">
          <Textarea
            placeholder={`Reply as ${customerName}…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className="min-h-0 resize-none border-0 p-1.5 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <span className="max-w-40 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.zip,.txt,.docx,.xlsx"
              onChange={(e) => {
                if (e.target.files) {
                  setFiles((prev) =>
                    [...prev, ...Array.from(e.target.files!)].slice(0, MAX_ATTACHMENTS)
                  );
                }
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Attach files"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
            <Button size="sm" onClick={submit} disabled={!body.trim() || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
