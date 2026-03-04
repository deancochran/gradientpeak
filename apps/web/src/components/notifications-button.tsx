"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

export function NotificationsButton() {
  const router = useRouter();
  const { data: unreadCount = 0 } =
    trpc.notifications.getUnreadCount.useQuery();
  const { data: notifications = [] } = trpc.notifications.getRecent.useQuery({
    limit: 5,
  });
  const utils = trpc.useUtils();

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.getRecent.invalidate();
    },
  });

  const handleNotificationClick = (notification: any) => {
    if (!notification.read_at) {
      markReadMutation.mutate({ notification_ids: [notification.id] });
    }

    // Navigate based on type
    if (notification.type === "coaching_invitation") {
      router.push("/coaching");
    } else if (notification.type === "new_message") {
      router.push("/messages");
    }
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
              <div className="font-medium">
                {n.type === "coaching_invitation" && "New Coaching Invite"}
                {n.type === "new_message" && "New Message"}
                {n.type === "new_follower" && "New Follower"}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString()}
              </div>
              {!n.read_at && (
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
