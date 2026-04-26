import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/cn";
import { Link, useLocation } from "@tanstack/react-router";

import { useAuth } from "../providers/auth-provider";
import { MessagesButton } from "./messages-button";
import { NotificationsButton } from "./notifications-button";
import { SearchLauncher } from "./search-launcher";
import { UserNav } from "./user-nav";

export function ProtectedHeader() {
  const location = useLocation();
  const { user } = useAuth();
  const primaryLinks = [
    { to: "/", label: "Home" },
    { to: "/activities", label: "Activities" },
    { to: "/routes", label: "Routes" },
    { to: "/record", label: "Record" },
    { to: "/plan", label: "Plan" },
    { to: "/calendar", label: "Calendar" },
    { to: "/coaching", label: "Coaching" },
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
        <SearchLauncher />
        <MessagesButton />
        <NotificationsButton />
        {user?.id ? (
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <Link
              to="/user/$userId"
              params={{ userId: user.id }}
              search={{ flash: undefined, flashType: undefined }}
            >
              Profile
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
          <Link to="/settings" search={{ flash: undefined, flashType: undefined }}>
            Settings
          </Link>
        </Button>
        <UserNav />
      </div>
    </header>
  );
}
