import { Button } from "@repo/ui/components/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command";
import { cn } from "@repo/ui/lib/cn";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Calendar,
  Circle,
  Home,
  Map as MapIcon,
  MessageSquare,
  Search,
  Settings,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "../providers/auth-provider";

type SearchLauncherProps = {
  className?: string;
  mode?: "icon" | "bar";
};

type SearchDestination = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  search?: Record<string, string | undefined>;
  to:
    | "/"
    | "/activities"
    | "/activity-efforts"
    | "/calendar"
    | "/coaching"
    | "/messages"
    | "/notifications"
    | "/plan"
    | "/profile-metrics"
    | "/record"
    | "/routes"
    | "/settings";
};

const SEARCH_DESTINATIONS: SearchDestination[] = [
  { icon: Home, label: "Home", to: "/" },
  { icon: Activity, label: "Activities", to: "/activities" },
  { icon: Activity, label: "Activity Efforts", to: "/activity-efforts" },
  { icon: TrendingUp, label: "Profile Metrics", to: "/profile-metrics" },
  { icon: MapIcon, label: "Routes", to: "/routes" },
  { icon: Circle, label: "Record", to: "/record" },
  { icon: Target, label: "Plan", to: "/plan" },
  { icon: Calendar, label: "Calendar", to: "/calendar" },
  { icon: Users, label: "Coaching", to: "/coaching" },
  {
    icon: Bell,
    label: "Notifications",
    to: "/notifications",
    search: { flash: undefined, flashType: undefined, view: "all" },
  },
  {
    icon: MessageSquare,
    label: "Messages",
    to: "/messages",
    search: { conversationId: undefined },
  },
  { icon: Settings, label: "Settings", to: "/settings" },
];

export function SearchLauncher({ className, mode = "icon" }: SearchLauncherProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const submitSearch = async () => {
    await navigate({
      to: "/search",
      search: { q: query.trim() === "" ? undefined : query.trim() },
    });
    setOpen(false);
  };

  const trigger =
    mode === "bar" ? (
      <Button
        asChild
        variant="outline"
        className={cn(
          "h-11 w-full justify-start gap-3 rounded-xl text-muted-foreground",
          className,
        )}
      >
        <Link
          to="/search"
          search={{ q: undefined }}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          <Search className="h-4 w-4" />
          <span>Search routes, plans, athletes, or actions</span>
        </Link>
      </Button>
    ) : (
      <Button asChild variant="ghost" size="icon" className={className}>
        <Link
          to="/search"
          search={{ q: undefined }}
          aria-label="Open search"
          title="Open search"
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          <Search className="h-5 w-5" />
        </Link>
      </Button>
    );

  return (
    <>
      {trigger}
      <CommandDialog open={open} onOpenChange={setOpen} title="Search GradientPeak">
        <CommandInput placeholder="Search the web app..." value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No direct match. Press Enter to open search.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {SEARCH_DESTINATIONS.map((item) => {
              const Icon = item.icon;

              return (
                <CommandItem
                  key={`${item.to}-${item.label}`}
                  value={item.label}
                  onSelect={() => {
                    void navigate({
                      to: item.to,
                      ...(item.search ? { search: item.search } : {}),
                    });
                    setOpen(false);
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Search">
            <CommandItem value={`search-${query || "all"}`} onSelect={() => void submitSearch()}>
              <Search className="h-4 w-4" />
              <span>{query.trim() ? `Search for "${query.trim()}"` : "Open search page"}</span>
            </CommandItem>
          </CommandGroup>
          {user?.id ? (
            <CommandGroup heading="Account">
              <CommandItem
                value="profile"
                onSelect={() => {
                  void navigate({
                    to: "/user/$userId",
                    params: { userId: user.id },
                    search: { flash: undefined, flashType: undefined },
                  });
                  setOpen(false);
                }}
              >
                <UserRound className="h-4 w-4" />
                <span>Profile</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
