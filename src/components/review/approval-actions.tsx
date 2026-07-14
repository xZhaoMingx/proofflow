"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Paperclip, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_ATTACHMENTS } from "@/lib/types";
import type { ChecklistResponse, ProofVersion, ReviewContext } from "@/lib/types";

interface ApprovalActionsProps {
  token: string;
  context: ReviewContext;
  currentVersion: ProofVersion;
  responsesForVersion: ChecklistResponse[];
  isLatestVersion: boolean;
  onDone: () => void;
}

export function ApprovalActions({
  token,
  context,
  currentVersion,
  responsesForVersion,
  isLatestVersion,
  onDone,
}: ApprovalActionsProps) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [approveComment, setApproveComment] = useState("");
  const [changeComment, setChangeComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { project, company, checklistItems, approval } = context;
  const finished = project.status === "approved" || project.status === "completed";

  // Approval record banner (also shown to returning customers).
  if (finished && approval) {
    return (
      <Card className="rounded-2xl border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
        <CardContent className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">
              Proof approved
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-300">
              Approved by {approval.customer_name} on{" "}
              {format(new Date(approval.created_at), "EEE, d MMM yyyy 'at' h:mm a")}
              {approval.comment ? <> — “{approval.comment}”</> : null}
            </p>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              {company.name} has been notified and will move your job to production.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const requireFullChecklist = company.settings.require_full_checklist !== false;
  const checkedIds = new Set(
    responsesForVersion.filter((r) => r.checked).map((r) => r.checklist_item_id)
  );
  const allChecked = checklistItems.every((i) => checkedIds.has(i.id));
  const approveBlocked =
    !isLatestVersion || (requireFullChecklist && !allChecked) || finished;
  const approveBlockedReason = !isLatestVersion
    ? "Switch to the latest version to approve."
    : requireFullChecklist && !allChecked
      ? "Please check every item in the review checklist first."
      : null;

  const checklistSnapshot = checklistItems.map((item) => ({
    label: item.label,
    checked: checkedIds.has(item.id),
  }));

  async function submitApproval() {
    setBusy(true);
    try {
      const res = await fetch(`/api/review/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: currentVersion.id,
          confirmed,
          comment: approveComment,
          checklist: checklistSnapshot,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Approval failed.");
      }
      setApproveOpen(false);
      toast.success("Proof approved — thank you!");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitChanges() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("versionId", currentVersion.id);
      form.set("comment", changeComment);
      files.forEach((file) => form.append("files", file));
      const res = await fetch(`/api/review/${token}/request-changes`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not send your request.");
      }
      setChangesOpen(false);
      setChangeComment("");
      setFiles([]);
      toast.success("Change request sent to your designer.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_ATTACHMENTS));
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                size="lg"
                disabled={approveBlocked}
                onClick={() => {
                  setConfirmed(false);
                  setApproveComment("");
                  setApproveOpen(true);
                }}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <ThumbsUp className="size-4" /> Approve Proof
              </Button>
            </div>
          </TooltipTrigger>
          {approveBlockedReason && <TooltipContent>{approveBlockedReason}</TooltipContent>}
        </Tooltip>

        <Button
          size="lg"
          variant="outline"
          disabled={finished}
          onClick={() => setChangesOpen(true)}
          className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          <ThumbsDown className="size-4" /> Request Changes
        </Button>
      </CardContent>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve version {currentVersion.version_number}?</DialogTitle>
            <DialogDescription>
              Approving tells {company.name} this proof is final and ready for production.
            </DialogDescription>
          </DialogHeader>
          <Label className="flex items-start gap-3 rounded-lg border p-3 font-normal">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">I confirm I have reviewed this proof.</span>
          </Label>
          <div className="grid gap-1.5">
            <Label htmlFor="approve-comment" className="text-sm">
              Comment <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="approve-comment"
              placeholder="Anything you'd like to add?"
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={!confirmed || busy}
              onClick={submitApproval}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Approve Proof
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request changes dialog */}
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Describe what should change. Your designer will upload a revised version.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Please make the phone number larger and switch the background to navy…"
            value={changeComment}
            onChange={(e) => setChangeComment(e.target.value)}
            rows={5}
            autoFocus
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.zip,.txt,.docx,.xlsx"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" /> Attach files
            </Button>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangesOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!changeComment.trim() || busy}
              onClick={submitChanges}
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
