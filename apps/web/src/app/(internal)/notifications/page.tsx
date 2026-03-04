"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc/client";
import { Bell, Mail, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function NotificationItem({ notification }: { notification: any }) {
  const isUnread = !notification.read_at;

  let Icon = Bell;
  let title = "Notification";
  let description = "Tap to view details.";

  if (notification.type === "new_message") {
    Icon = Mail;
    title = "New Message";
    description = "You have a new message in your inbox.";
  } else if (notification.type === "coaching_invitation") {
    Icon = UserPlus;
    title = "Coaching Invite";
    description = "You have received a new coaching invitation.";
  } else if (notification.type === "new_follower") {
    Icon = UserPlus;
    title = "New Follower";
    description = "Someone new started following you.";
  }

  return (
    <div className="flex items-start gap-4 p-4 border-b">
      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className={cn("font-medium", isUnread && "font-bold")}>{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(notification.created_at).toLocaleString()}
        </p>
      </div>
      {isUnread && <div className="h-2 w-2 rounded-full bg-primary mt-1" />}
    </div>
  );
}

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } =
    trpc.notifications.getRecent.useQuery({ limit: 50 });
  const utils = trpc.useUtils();

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.getRecent.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const handleReadAll = () => {
    const unreadIds = notifications
      .filter((n: any) => !n.read_at)
      .map((n: any) => n.id);
    if (unreadIds.length > 0) {
      markReadMutation.mutate({ notification_ids: unreadIds });
    }
  };

  const allNotifications = notifications;
  const unreadNotifications = notifications.filter((n: any) => !n.read_at);

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">
            Manage your notifications and alerts.
          </p>
        </div>
        <Button
          onClick={handleReadAll}
          disabled={unreadNotifications.length === 0}
        >
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
                  <div className="p-8 text-center text-muted-foreground">
                    Loading...
                  </div>
                ) : allNotifications.length > 0 ? (
                  allNotifications.map((n) => (
                    <NotificationItem key={n.id} notification={n} />
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No notifications yet.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="unread">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Loading...
                  </div>
                ) : unreadNotifications.length > 0 ? (
                  unreadNotifications.map((n) => (
                    <NotificationItem key={n.id} notification={n} />
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
