"use client";

import { Bell } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Badge } from "@repo/ui/components/badge";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

export function NotificationsButton() {
  const router = useRouter();
  const { data: unreadCount = 0 } =
    trpc.notifications.getUnreadCount.useQuery();
  const { data: notifications = [] } = trpc.notifications.getRecent.useQuery({
    limit: 5,
  });
  type Notification = (typeof notifications)[number];
  const utils = trpc.useUtils();

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.getRecent.invalidate();
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate({ notification_ids: [notification.id] });
    }

    router.push("/notifications");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No new notifications
          </div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className="cursor-pointer flex flex-col items-start gap-1 p-3"
            >
              <div className="font-medium">{n.title}</div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                {n.message}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString()}
              </div>
              {!n.is_read && (
                <div className="h-2 w-2 rounded-full bg-blue-500 absolute top-3 right-3" />
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer justify-center text-center"
          onClick={() => router.push("/notifications")}
        >
          View all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
