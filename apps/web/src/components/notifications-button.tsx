"use client";

import { getNotificationViewModel, normalizeNotificationListItem } from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export function NotificationsButton() {
  const router = useRouter();
  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery();
  const { data: notifications = [] } = trpc.notifications.getRecent.useQuery({
    limit: 5,
  });
  const normalizedNotifications = notifications
    .map((notification) => normalizeNotificationListItem(notification))
    .filter(
      (
        notification,
      ): notification is NonNullable<ReturnType<typeof normalizeNotificationListItem>> =>
        notification !== null,
    );
  const utils = trpc.useUtils();

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.getRecent.invalidate();
    },
  });

  const handleNotificationClick = (notification: (typeof normalizedNotifications)[number]) => {
    if (getNotificationViewModel(notification).isUnread) {
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
        {normalizedNotifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No new notifications</div>
        ) : (
          normalizedNotifications.map((notification) => {
            const item = getNotificationViewModel(notification);

            return (
              <DropdownMenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className="cursor-pointer flex flex-col items-start gap-1 p-3"
              >
                <div className="font-medium">{item.title}</div>
                <div className="text-sm text-muted-foreground line-clamp-2">{item.description}</div>
                <div className="text-xs text-muted-foreground">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                </div>
                {item.isUnread && (
                  <div className="h-2 w-2 rounded-full bg-blue-500 absolute top-3 right-3" />
                )}
              </DropdownMenuItem>
            );
          })
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
