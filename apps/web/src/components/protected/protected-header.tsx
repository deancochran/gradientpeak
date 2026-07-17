import { Button } from "@repo/ui/components/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { cn } from "@repo/ui/lib/cn";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";

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
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <MobileNavigation primaryLinks={primaryLinks} pathname={location.pathname} />
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
            GP
          </div>
          <span className="truncate max-sm:sr-only">GradientPeak</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {primaryLinks.map((link) => {
            const isActive = isActivePath(location.pathname, link.to);

            return (
              <Button key={link.to} asChild variant="ghost" size="sm">
                <Link
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
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
      </div>
    </header>
  );
}

type PrimaryLink = {
  to: "/" | "/activities" | "/routes" | "/record" | "/plan" | "/calendar" | "/coaching";
  label: string;
};

function isActivePath(pathname: string, to: PrimaryLink["to"]) {
  return pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
}

function MobileNavigation({
  primaryLinks,
  pathname,
}: {
  primaryLinks: readonly PrimaryLink[];
  pathname: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 max-w-[88vw] gap-0 p-0">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle>GradientPeak</SheetTitle>
          <SheetDescription>Training, recording, planning, and social tools.</SheetDescription>
        </SheetHeader>
        <nav className="grid gap-1 p-3" aria-label="Mobile primary navigation">
          {primaryLinks.map((link) => {
            const isActive = isActivePath(pathname, link.to);

            return (
              <SheetClose key={link.to} asChild>
                <Link
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    isActive && "bg-muted text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              </SheetClose>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
