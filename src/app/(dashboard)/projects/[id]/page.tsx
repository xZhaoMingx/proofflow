import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { getProjectDetail } from "@/lib/data/projects";
import { StatusBadge } from "@/components/status-badge";
import { StatusSelect } from "@/components/dashboard/status-select";
import { VersionUploadCard } from "@/components/dashboard/version-upload-card";
import { ReviewLinksCard } from "@/components/dashboard/review-links-card";
import { TeamThreadCard } from "@/components/dashboard/team-thread-card";
import { ClickUpCard } from "@/components/dashboard/clickup-card";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  const detail = await getProjectDetail(profile, id);
  if (!detail) notFound();

  const { project, customer, designer, versions, reviewLinks, comments, activity, clickup } =
    detail;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/projects"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-semibold">
              {project.name} <StatusBadge status={project.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {customer ? `${customer.name} (${customer.email})` : "No customer"} ·{" "}
              {project.due_date
                ? `due ${format(new Date(project.due_date), "d MMM yyyy")}`
                : "no due date"}{" "}
              · handled by {project.contact_name ?? designer?.full_name ?? "—"}
            </p>
          </div>
          <StatusSelect projectId={project.id} status={project.status} />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <VersionUploadCard projectId={project.id} versions={versions} />
          <TeamThreadCard projectId={project.id} comments={comments} profileId={profile.id} />
        </div>
        <div className="flex flex-col gap-4">
          <ReviewLinksCard projectId={project.id} links={reviewLinks} />
          <ClickUpCard projectId={project.id} link={clickup} />
          <Card className="rounded-2xl border-dashed">
            <CardContent className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Internal notes</span> live in the
              conversation card under the “Internal notes” tab — customers never see them.
            </CardContent>
          </Card>
          <ActivityTimeline events={activity} />
        </div>
      </div>
    </div>
  );
}
