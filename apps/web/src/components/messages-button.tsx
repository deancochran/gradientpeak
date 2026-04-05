"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api/client";

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
      <Link href="/messages">
        <MessageSquare className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
        <span className="sr-only">{label}</span>
      </Link>
    </Button>
  );
}
