import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/cn";
import { Link, useLocation } from "@tanstack/react-router";

import { MessagesButton } from "./messages-button";
import { NotificationsButton } from "./notifications-button";
import { UserNav } from "./user-nav";

export function ProtectedHeader() {
  const location = useLocation();
  const primaryLinks = [
    { to: "/", label: "Dashboard" },
    { to: "/coaching", label: "Coaching" },
    { to: "/messages", label: "Messages" },
    { to: "/notifications", label: "Notifications" },
    { to: "/settings", label: "Settings" },
  ] as const;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
          GP
        </div>
        <span>GradientPeak</span>
      </Link>
      <nav className="hidden items-center gap-1 md:flex">
        {primaryLinks.map((link) => {
          const isActive =
            location.pathname === link.to ||
            (link.to !== "/" && location.pathname.startsWith(`${link.to}/`));

          return (
            <Button key={link.to} asChild variant="ghost" size="sm">
              <Link
                to={link.to}
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
