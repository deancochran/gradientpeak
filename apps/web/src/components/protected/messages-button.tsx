import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { api } from "../../lib/api/client";

export function MessagesButton() {
  const { data: unreadCount = 0 } = api.messaging.getUnreadCount.useQuery();
  const label = unreadCount > 0 ? `Messages (${unreadCount} unread)` : "Messages";

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={label}
      title={label}
    >
      <Link
        to="/messages"
        search={{
          compose: false,
          composeGroup: undefined,
          composeQuery: undefined,
          composeRecipients: [],
          conversationId: undefined,
          flash: undefined,
          flashType: undefined,
        }}
      >
        <MessageSquare className="h-5 w-5" />
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
