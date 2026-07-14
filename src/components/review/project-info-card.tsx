import { format } from "date-fns";
import { CalendarDays, Hash, Palette, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import type { ProofVersion, ReviewContext } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProjectInfoCard({
  context,
  currentVersion,
}: {
  context: ReviewContext;
  currentVersion: ProofVersion;
}) {
  const { company, project, customer, designer } = context;

  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    {
      icon: <User className="size-3.5" />,
      label: "Customer",
      value: customer ? `${customer.name}${customer.company_name ? ` · ${customer.company_name}` : ""}` : "—",
    },
    {
      icon: <Hash className="size-3.5" />,
      label: "Job number",
      value: project.job_number ?? "—",
    },
    {
      icon: <Palette className="size-3.5" />,
      label: "Designer",
      value: designer?.full_name ?? "—",
    },
    {
      icon: <CalendarDays className="size-3.5" />,
      label: "Due date",
      value: project.due_date ? format(new Date(project.due_date), "EEE, d MMM yyyy") : "—",
    },
  ];

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-11 rounded-xl">
            {company.logo_url && <AvatarImage src={company.logo_url} alt={company.name} />}
            <AvatarFallback className="rounded-xl text-sm font-semibold">
              {initials(company.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">{project.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{company.name}</p>
          </div>
          <StatusBadge status={project.status} />
        </div>

        <Separator />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {row.icon}
                {row.label}
              </dt>
              <dd className="mt-0.5 truncate font-medium">{row.value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-muted-foreground">Current version</dt>
            <dd className="mt-0.5 font-medium">Version {currentVersion.version_number}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
