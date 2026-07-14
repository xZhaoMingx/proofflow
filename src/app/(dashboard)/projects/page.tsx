import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { FolderOpen } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { listProjects } from "@/lib/data/projects";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { NewProjectDialog } from "@/components/dashboard/new-project-dialog";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const projects = await listProjects(profile);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Every proof, its status, and its customer in one place.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      {projects.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <FolderOpen className="size-10 text-muted-foreground" />
            <p className="font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first project and upload a proof to send for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full rounded-2xl transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{project.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {project.customer?.name ?? "No customer"}
                        {project.customer?.company_name
                          ? ` · ${project.customer.company_name}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                  <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                    <span>{project.job_number ?? "—"}</span>
                    <span>
                      {project.latestVersion > 0
                        ? `v${project.latestVersion}`
                        : "No proof yet"}
                    </span>
                    <span>
                      {project.due_date
                        ? `Due ${format(new Date(project.due_date), "d MMM")}`
                        : "No due date"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
