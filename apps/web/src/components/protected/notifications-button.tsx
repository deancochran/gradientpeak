import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { api } from "../../lib/api/client";

export function NotificationsButton() {
  const { data: unreadCount = 0 } = api.notifications.getUnreadCount.useQuery();
  const label = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications";

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={label}
      title={label}
    >
      <Link to="/notifications" search={{ flash: undefined, flashType: undefined, view: "all" }}>
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
      </Link>
    </Button>
  );
}
