import { invalidateNotificationQueries } from "@repo/api/react";
import { getNotificationViewModel, normalizeNotificationListItem } from "@repo/core/notifications";
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
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { api } from "../../lib/api/client";

export function NotificationsButton() {
  const navigate = useNavigate();
  const { data: unreadCount = 0 } = api.notifications.getUnreadCount.useQuery();
  const { data: notifications = [] } = api.notifications.getRecent.useQuery({ limit: 5 });
  const normalizedNotifications = notifications
    .map((notification) => normalizeNotificationListItem(notification))
    .filter(
      (
        notification,
      ): notification is NonNullable<ReturnType<typeof normalizeNotificationListItem>> =>
        notification !== null,
    );
  const utils = api.useUtils();
  const label = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications";

  const markReadMutation = api.notifications.markRead.useMutation({
    onSuccess: async () => invalidateNotificationQueries(utils),
  });

  const handleNotificationClick = async (
    notification: NonNullable<ReturnType<typeof normalizeNotificationListItem>>,
  ) => {
    if (getNotificationViewModel(notification).isUnread) {
      markReadMutation.mutate({ notification_ids: [notification.id] });
    }

    await navigate({ to: "/notifications" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
          <span className="sr-only">{label}</span>
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
                onClick={() => void handleNotificationClick(notification)}
                className="flex cursor-pointer flex-col items-start gap-1 p-3"
              >
                <div className="font-medium">{item.title}</div>
                <div className="line-clamp-2 text-sm text-muted-foreground">{item.description}</div>
                <div className="text-xs text-muted-foreground">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                </div>
                {item.isUnread ? <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-blue-500" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/notifications" className="cursor-pointer justify-center text-center">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
