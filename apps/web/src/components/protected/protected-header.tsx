import { Button } from "@repo/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { cn } from "@repo/ui/lib/cn";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../providers/auth-provider";
import { MessagesButton } from "./messages-button";
import { NotificationsButton } from "./notifications-button";
import { SearchLauncher } from "./search-launcher";
import { UserNav } from "./user-nav";

const primaryLinks = [
  { to: "/", label: "Home" },
  { to: "/activities", label: "Activities" },
  { to: "/routes", label: "Routes" },
  { to: "/record", label: "Record" },
  { to: "/plan", label: "Plan" },
  { to: "/calendar", label: "Calendar" },
  { to: "/coaching", label: "Coaching" },
] as const;

export function ProtectedHeader() {
  const location = useLocation();
  const { user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isActive = (to: (typeof primaryLinks)[number]["to"]) =>
    location.pathname === to || (to !== "/" && location.pathname.startsWith(`${to}/`));
  const isProfileActive = user?.id ? location.pathname === `/user/${user.id}` : false;
  const isSettingsActive =
    location.pathname === "/settings" || location.pathname.startsWith("/settings/");

  return (
    <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:gap-4 sm:px-6">
      <Link
        to="/"
        aria-label="GradientPeak home"
        className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
          GP
        </div>
        <span className="hidden sm:inline">GradientPeak</span>
      </Link>
      <nav aria-label="Primary navigation" className="hidden items-center gap-1 xl:flex">
        {primaryLinks.map((link) => (
          <Button key={link.to} asChild variant="ghost" size="sm">
            <Link
              to={link.to}
              aria-current={isActive(link.to) ? "page" : undefined}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
                isActive(link.to) && "text-foreground",
              )}
            >
              {link.label}
            </Link>
          </Button>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <SearchLauncher />
        <MessagesButton />
        <NotificationsButton />
        {user?.id ? (
          <Button asChild variant="ghost" size="sm" className="hidden xl:inline-flex">
            <Link
              to="/user/$userId"
              params={{ userId: user.id }}
              search={{ flash: undefined, flashType: undefined }}
              aria-current={isProfileActive ? "page" : undefined}
            >
              Profile
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm" className="hidden xl:inline-flex">
          <Link
            to="/settings"
            search={{ flash: undefined, flashType: undefined }}
            aria-current={isSettingsActive ? "page" : undefined}
          >
            Settings
          </Link>
        </Button>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              aria-label="Open navigation menu"
              title="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(22rem,calc(100vw-2rem))]">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Navigate GradientPeak.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile primary navigation" className="flex flex-col gap-1 px-4 pb-4">
              {primaryLinks.map((link) => (
                <Button
                  key={link.to}
                  asChild
                  variant={isActive(link.to) ? "secondary" : "ghost"}
                  className="justify-start"
                >
                  <Link
                    to={link.to}
                    aria-current={isActive(link.to) ? "page" : undefined}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {link.label}
                  </Link>
                </Button>
              ))}
              <div className="my-2 border-t" />
              {user?.id ? (
                <Button asChild variant="ghost" className="justify-start">
                  <Link
                    to="/user/$userId"
                    params={{ userId: user.id }}
                    search={{ flash: undefined, flashType: undefined }}
                    aria-current={isProfileActive ? "page" : undefined}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    Profile
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" className="justify-start">
                <Link
                  to="/settings"
                  search={{ flash: undefined, flashType: undefined }}
                  aria-current={isSettingsActive ? "page" : undefined}
                  onClick={() => setMobileNavOpen(false)}
                >
                  Settings
                </Link>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
        <UserNav />
      </div>
    </header>
  );
}
