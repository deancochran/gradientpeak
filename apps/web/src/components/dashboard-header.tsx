"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/cn";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesButton } from "@/components/messages-button";
import { NotificationsButton } from "@/components/notifications-button";
import { UserNav } from "@/components/user-nav";

export function DashboardHeader() {
  const pathname = usePathname();
  const primaryLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/coaching", label: "Coaching" },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <Link href="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
        <Image
          src="/images/icons/splash-icon-prod.svg"
          className="dark:invert"
          height={28}
          width={28}
          alt="GradientPeak"
        />
        <span>GradientPeak</span>
      </Link>
      <nav className="hidden items-center gap-1 md:flex">
        {primaryLinks.map((link) => {
          const isActive =
            pathname === link.href || (link.href !== "/" && pathname?.startsWith(`${link.href}/`));

          return (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <Link
                href={link.href}
                className={cn(
                  "text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "text-foreground",
                )}
              >
                {link.label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <MessagesButton />
        <NotificationsButton />
        <UserNav />
      </div>
    </header>
  );
}
