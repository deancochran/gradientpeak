"use client";

import { useState } from "react";
import { toast } from "sonner";
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

const getField = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
};

const getStringField = (value: unknown, key: string): string | undefined => {
  const field = getField(value, key);
  return typeof field === "string" ? field : undefined;
};

const getNullableStringField = (
  value: unknown,
  key: string,
): string | null | undefined => {
  const field = getField(value, key);
  return typeof field === "string" || field === null ? field : undefined;
};

const getBooleanField = (value: unknown, key: string): boolean | undefined => {
  const field = getField(value, key);
  return typeof field === "boolean" ? field : undefined;
};

export default function NotificationsPage() {
  const { data: profile } = trpc.profiles.get.useQuery();
  const { data: notifications = [], isLoading } =
    trpc.notifications.getRecent.useQuery({ limit: 50 });
  const utils = trpc.useUtils();
  type Notification = (typeof notifications)[number];

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.getRecent.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const NotificationItem = ({
    notification,
    profileData,
  }: {
    notification: Notification;
    profileData?: unknown;
  }) => {
    const [handled, setHandled] = useState(false);
    const itemUtils = trpc.useUtils();

    const readAt = getNullableStringField(notification, "read_at");
    const isUnread = !readAt;
    const notificationType = getStringField(notification, "type");
    const actorId = getStringField(notification, "actor_id");
    const createdAt = getStringField(notification, "created_at") ?? "";
    const isPrivate = getBooleanField(profileData, "is_public") === false;
    const isFollowRequest = notificationType === "new_follower" && isPrivate;

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

    if (notificationType === "new_message") {
      Icon = Mail;
      title = "New Message";
      description = "You have a new message in your inbox.";
    } else if (notificationType === "coaching_invitation") {
      Icon = UserPlus;
      title = "Coaching Invite";
      description = "You have received a new coaching invitation.";
    } else if (notificationType === "new_follower") {
      Icon = UserPlus;
      title = isFollowRequest ? "Follow Request" : "New Follower";
      description = isFollowRequest
        ? "Someone requested to follow you."
        : "Someone new started following you.";
    }

    return (
      <div className="flex items-start gap-4 p-4 border-b">
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className={cn("font-medium", isUnread && "font-bold")}>{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
          {isFollowRequest && !handled && (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => {
                  if (actorId) {
                    acceptMutation.mutate({ follower_id: actorId });
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
                  if (actorId) {
                    rejectMutation.mutate({ follower_id: actorId });
                  }
                }}
                disabled={acceptMutation.isPending || rejectMutation.isPending}
              >
                Reject
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(createdAt).toLocaleString()}
          </p>
        </div>
        {isUnread && <div className="h-2 w-2 rounded-full bg-primary mt-1" />}
      </div>
    );
  };

  const handleReadAll = () => {
    const unreadIds = notifications
      .filter((n) => !getNullableStringField(n, "read_at"))
      .map((n) => n.id);

    if (unreadIds.length > 0) {
      markReadMutation.mutate({ notification_ids: unreadIds });
    }
  };

  const unreadNotifications = notifications.filter(
    (n) => !getNullableStringField(n, "read_at"),
  );

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
                ) : notifications.length > 0 ? (
                  notifications.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      profileData={profile}
                    />
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
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      profileData={profile}
                    />
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
