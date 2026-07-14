"use client";

import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { markNotificationsReadAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppNotification } from "@/lib/types";

const TITLES: Record<string, string> = {
  proof_viewed: "Proof viewed",
  proof_approved: "Proof approved",
  revision_requested: "Revision requested",
  comment_added: "New comment",
  version_uploaded: "New version uploaded",
};

export function NotificationsBell({ notifications }: { notifications: AppNotification[] }) {
  const [, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && unread > 0) startTransition(() => void markNotificationsReadAction());
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`}>
          <span className="relative">
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex flex-col gap-0.5 border-b px-2 py-2.5 text-sm last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{TITLES[n.type] ?? n.type}</span>
                  {!n.read_at && <span className="size-2 rounded-full bg-blue-500" />}
                </div>
                {typeof n.payload.projectName === "string" && (
                  <span className="text-xs text-muted-foreground">{n.payload.projectName}</span>
                )}
                {typeof n.payload.detail === "string" && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {n.payload.detail}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
