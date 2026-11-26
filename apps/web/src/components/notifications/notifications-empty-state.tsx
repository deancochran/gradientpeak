import { Bell } from "lucide-react";

export function NotificationsEmptyState({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
      <Bell aria-hidden="true" className="h-5 w-5" />
      <p className="font-medium text-foreground">
        {unreadOnly ? "You are all caught up" : "No notifications yet"}
      </p>
      <p className="text-sm">
        {unreadOnly
          ? "New activity will appear here when it needs your attention."
          : "Updates about messages, follows, and invitations will appear here."}
      </p>
    </div>
  );
}
