"use client";

import {
  getNotificationViewModel,
  getUnreadNotificationIds,
  normalizeNotificationListItem,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/cn";
import { Bell, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = trpc.notifications.getRecent.useQuery({
    limit: 50,
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
      utils.notifications.getRecent.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const NotificationItem = ({
    notification,
  }: {
    notification: (typeof normalizedNotifications)[number];
  }) => {
    const [handled, setHandled] = useState(false);
    const itemUtils = trpc.useUtils();
    const item = getNotificationViewModel(notification);

    const acceptMutation = trpc.social.acceptFollowRequest.useMutation({
      onSuccess: () => {
        toast.success("Follow request accepted");
        setHandled(true);
        itemUtils.notifications.getRecent.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });

    const rejectMutation = trpc.social.rejectFollowRequest.useMutation({
      onSuccess: () => {
        toast.success("Follow request rejected");
        setHandled(true);
        itemUtils.notifications.getRecent.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });

    let Icon = Bell;
    let title = "Notification";
    let description = "Tap to view details.";

    if (item.type === "new_message") {
      Icon = Mail;
      title = item.title;
      description = item.description;
    } else if (item.type === "coaching_invitation") {
      Icon = UserPlus;
      title = item.title;
      description = item.description;
    } else if (item.type === "new_follower" || item.type === "follow_request") {
      Icon = UserPlus;
      title = item.title;
      description = item.description;
    }

    return (
      <div className="flex items-start gap-4 p-4 border-b">
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className={cn("font-medium", item.isUnread && "font-bold")}>{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
          {item.requiresFollowRequestAction && !handled && (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => {
                  if (item.actorId) {
                    acceptMutation.mutate({ follower_id: item.actorId });
                  }
                }}
                disabled={acceptMutation.isPending || rejectMutation.isPending}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (item.actorId) {
                    rejectMutation.mutate({ follower_id: item.actorId });
                  }
                }}
                disabled={acceptMutation.isPending || rejectMutation.isPending}
              >
                Reject
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
          </p>
        </div>
        {item.isUnread && <div className="h-2 w-2 rounded-full bg-primary mt-1" />}
      </div>
    );
  };

  const handleReadAll = () => {
    const unreadIds = getUnreadNotificationIds(normalizedNotifications);

    if (unreadIds.length > 0) {
      markReadMutation.mutate({ notification_ids: unreadIds });
    }
  };

  const unreadNotifications = normalizedNotifications.filter(
    (notification) => getNotificationViewModel(notification).isUnread,
  );

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">Manage your notifications and alerts.</p>
        </div>
        <Button onClick={handleReadAll} disabled={unreadNotifications.length === 0}>
          Mark all as read
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Notifications</CardTitle>
          <CardDescription>
            You have {unreadNotifications.length} unread notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="all">
            <TabsList className="px-6 border-b w-full justify-start rounded-none bg-transparent">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>
            <ScrollArea className="h-[calc(100vh-22rem)]">
              <TabsContent value="all">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : normalizedNotifications.length > 0 ? (
                  normalizedNotifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">No notifications yet.</div>
                )}
              </TabsContent>
              <TabsContent value="unread">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : unreadNotifications.length > 0 ? (
                  unreadNotifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No unread notifications.
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
