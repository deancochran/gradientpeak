"use client";

import { NotificationsButton } from "@/components/notifications-button";
import { MessagesButton } from "@/components/messages-button";
import { UserNav } from "@/components/user-nav";
import Link from "next/link";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-semibold text-lg">
          GradientPeak
        </Link>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <MessagesButton />
        <NotificationsButton />
        <UserNav />
      </div>
    </header>
  );
}
