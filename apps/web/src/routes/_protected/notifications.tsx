import {
  getNotificationViewModel,
  getUnreadNotificationIds,
  normalizeNotificationListItem,
} from "@repo/core/notifications";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { cn } from "@repo/ui/lib/cn";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Mail, UserPlus } from "lucide-react";

import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { markNotificationsReadAction } from "../../lib/notifications/server-actions";
import {
  acceptFollowRequestAction,
  rejectFollowRequestAction,
} from "../../lib/social/server-actions";

export const Route = createFileRoute("/_protected/notifications")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
    view: search.view === "unread" ? "unread" : "all",
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = Route.useNavigate();
  const { flash, flashType, view } = Route.useSearch();
  const { data: notifications = [], isLoading } = api.notifications.getRecent.useQuery({
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
  const unreadNotifications = normalizedNotifications.filter(
    (notification) => getNotificationViewModel(notification).isUnread,
  );
  const unreadIds = getUnreadNotificationIds(normalizedNotifications);
  const visibleNotifications = view === "unread" ? unreadNotifications : normalizedNotifications;

  return (
    <div className="flex h-full flex-1 flex-col space-y-8">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/notifications",
            search: { flash: undefined, flashType: undefined, view },
            replace: true,
          })
        }
      />
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">Open, review, and clear the latest activity.</p>
        </div>
        <form action={markNotificationsReadAction.url} method="post">
          <input type="hidden" name="redirectTo" value="/notifications" />
          {unreadIds.map((notificationId) => (
            <input
              key={notificationId}
              type="hidden"
              name="notification_ids"
              value={notificationId}
            />
          ))}
          <Button type="submit" disabled={unreadNotifications.length === 0}>
            Mark all as read
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your Notifications</CardTitle>
          <CardDescription>
            You have {unreadNotifications.length} unread notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex w-full justify-start gap-2 border-b px-6 py-3">
            <Button asChild variant={view === "all" ? "default" : "ghost"} size="sm">
              <Link
                to="/notifications"
                search={{ flash: undefined, flashType: undefined, view: "all" }}
              >
                All
              </Link>
            </Button>
            <Button asChild variant={view === "unread" ? "default" : "ghost"} size="sm">
              <Link
                to="/notifications"
                search={{ flash: undefined, flashType: undefined, view: "unread" }}
              >
                Unread
              </Link>
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-22rem)]">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : visibleNotifications.length > 0 ? (
              visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  redirectTo={`/notifications?view=${view}`}
                />
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                {view === "unread" ? "No unread notifications." : "No notifications yet."}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function getNotificationTargetHref(
  notification: NonNullable<ReturnType<typeof normalizeNotificationListItem>>,
) {
  const item = getNotificationViewModel(notification);

  switch (item.type) {
    case "new_message":
      return typeof notification.entity_id === "string"
        ? `/messages?conversationId=${notification.entity_id}`
        : "/messages";
    case "new_follower":
    case "follow_request":
      return item.actorId ? `/user/${item.actorId}` : "/notifications";
    case "coaching_invitation":
    case "coaching_invitation_accepted":
    case "coaching_invitation_declined":
      return item.actorId ? `/user/${item.actorId}` : "/coaching";
    default:
      return "/notifications";
  }
}

function NotificationItem({
  notification,
  redirectTo,
}: {
  notification: NonNullable<ReturnType<typeof normalizeNotificationListItem>>;
  redirectTo: string;
}) {
  const item = getNotificationViewModel(notification);
  const targetHref = getNotificationTargetHref(notification);

  let Icon = Bell;
  let title = "Notification";
  let description = "Open to view details.";
  if (item.type === "new_message") {
    Icon = Mail;
    title = item.title;
    description = item.description;
  } else if (
    item.type === "coaching_invitation" ||
    item.type === "new_follower" ||
    item.type === "follow_request" ||
    item.type === "coaching_invitation_accepted" ||
    item.type === "coaching_invitation_declined"
  ) {
    Icon = UserPlus;
    title = item.title;
    description = item.description;
  }

  return (
    <div className="flex items-start gap-4 border-b p-4">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className={cn("font-medium", item.isUnread && "font-bold")}>{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.isUnread ? (
            <form action={markNotificationsReadAction.url} method="post">
              <input type="hidden" name="notification_ids" value={notification.id} />
              <input type="hidden" name="redirectTo" value={targetHref} />
              <input type="hidden" name="successMessage" value="Notification marked as read" />
              <Button size="sm" type="submit">
                Open
              </Button>
            </form>
          ) : (
            <Button asChild size="sm" variant="outline">
              <a href={targetHref}>Open</a>
            </Button>
          )}
          {item.requiresFollowRequestAction ? (
            item.actorId ? (
              <>
                <form action={acceptFollowRequestAction.url} method="post">
                  <input type="hidden" name="follower_id" value={item.actorId} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <Button size="sm" type="submit">
                    Accept
                  </Button>
                </form>
                <form action={rejectFollowRequestAction.url} method="post">
                  <input type="hidden" name="follower_id" value={item.actorId} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <Button size="sm" variant="outline" type="submit">
                    Reject
                  </Button>
                </form>
              </>
            ) : null
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
        </p>
      </div>
      {item.isUnread ? <div className="mt-1 h-2 w-2 rounded-full bg-primary" /> : null}
    </div>
  );
}
