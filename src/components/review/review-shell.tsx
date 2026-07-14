"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import type { ReviewContext } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProofViewer } from "@/components/viewer/proof-viewer";
import { ProjectInfoCard } from "@/components/review/project-info-card";
import { ReviewChecklist } from "@/components/review/review-checklist";
import { ApprovalActions } from "@/components/review/approval-actions";
import { CommentThread } from "@/components/comments/comment-thread";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { VersionHistory } from "@/components/versions/version-history";
import { StatusBadge } from "@/components/status-badge";

interface ReviewShellProps {
  token: string;
  context: ReviewContext;
  proofUrls: Record<string, string>;
}

export function ReviewShell({ token, context, proofUrls }: ReviewShellProps) {
  const router = useRouter();
  const { project, company, versions } = context;
  const [versionIndex, setVersionIndex] = useState(versions.length - 1);
  const currentVersion = versions[versionIndex];
  const isLatestVersion = versionIndex === versions.length - 1;

  // Record "proof viewed" for each version the customer opens (server dedupes).
  const viewedVersions = useRef(new Set<number>());
  useEffect(() => {
    if (!currentVersion || viewedVersions.current.has(currentVersion.version_number)) return;
    viewedVersions.current.add(currentVersion.version_number);
    fetch(`/api/review/${token}/viewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionNumber: currentVersion.version_number }),
    }).catch(() => {});
  }, [token, currentVersion]);

  // Mark employee replies as read for this review link.
  useEffect(() => {
    fetch(`/api/review/${token}/comments/read`, { method: "POST" }).catch(() => {});
  }, [token, context.comments.length]);

  // Light polling keeps the thread and status fresh while the page is open.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 25000);
    return () => clearInterval(interval);
  }, [router]);

  const responsesForVersion = useMemo(
    () =>
      context.checklistResponses.filter((r) => r.proof_version_id === currentVersion?.id),
    [context.checklistResponses, currentVersion]
  );

  const refresh = useCallback(() => router.refresh(), [router]);

  if (!currentVersion) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border bg-card p-10 text-center shadow-sm">
          <Layers className="mx-auto mb-4 size-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold">No proof uploaded yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ll get an email as soon as {company.name} uploads your first proof.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{project.name}</p>
              <p className="truncate text-xs text-muted-foreground leading-tight">
                {company.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={project.status} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)] lg:items-start lg:gap-4">
        <div className="mb-4 lg:sticky lg:top-[72px] lg:mb-0">
          <ProofViewer
            version={currentVersion}
            proofUrl={proofUrls[currentVersion.id]}
            versionCount={versions.length}
            onPrev={() => setVersionIndex((i) => Math.max(0, i - 1))}
            onNext={() => setVersionIndex((i) => Math.min(versions.length - 1, i + 1))}
            hasPrev={versionIndex > 0}
            hasNext={versionIndex < versions.length - 1}
            isLatest={isLatestVersion}
          />
        </div>

        <div className="flex flex-col gap-4 pb-8">
          <ProjectInfoCard context={context} currentVersion={currentVersion} />

          <ReviewChecklist
            token={token}
            items={context.checklistItems}
            responses={responsesForVersion}
            versionId={currentVersion.id}
            disabled={project.status === "approved" || project.status === "completed"}
          />

          <ApprovalActions
            token={token}
            context={context}
            currentVersion={currentVersion}
            responsesForVersion={responsesForVersion}
            isLatestVersion={isLatestVersion}
            onDone={refresh}
          />

          <CommentThread
            token={token}
            comments={context.comments}
            customerName={context.customer?.name ?? "You"}
            onPosted={refresh}
          />

          <VersionHistory
            versions={versions}
            currentIndex={versionIndex}
            onSelect={setVersionIndex}
          />

          <ActivityTimeline events={context.activity} />
        </div>
      </main>
    </div>
  );
}
