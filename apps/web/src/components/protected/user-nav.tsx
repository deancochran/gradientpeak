import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Bell,
  CalendarDays,
  ClipboardList,
  Gauge,
  Home,
  LogOut,
  MessageSquare,
  Plug,
  Settings,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";

import { signOutAction } from "../../lib/auth/server-actions";
import { useAuth } from "../providers/auth-provider";

function getInitials(email: string | null | undefined) {
  if (!email) return "GP";
  return email.slice(0, 2).toUpperCase();
}

export function UserNav() {
  const { user } = useAuth();
  const signOut = useServerFn(signOutAction);
  const [isPending, setIsPending] = useState(false);
  const displayName = user?.email ?? "User";
  type AccountLink = {
    icon: typeof Home;
    label: string;
    to:
      | "/"
      | "/activity-efforts"
      | "/activity-plans"
      | "/goals"
      | "/groups"
      | "/integrations"
      | "/messages"
      | "/notifications"
      | "/profile-metrics"
      | "/scheduled-activities"
      | "/training-plans"
      | "/training-preferences"
      | "/trends"
      | "/settings";
  };
  const accountLinks: AccountLink[] = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/activity-plans", label: "Activity plans", icon: ClipboardList },
    { to: "/training-plans", label: "Training plans", icon: ClipboardList },
    { to: "/scheduled-activities", label: "Scheduled activities", icon: CalendarDays },
    { to: "/goals", label: "Goals", icon: Target },
    { to: "/groups", label: "Groups", icon: Users },
    { to: "/trends", label: "Trends", icon: TrendingUp },
    { to: "/activity-efforts", label: "Activity efforts", icon: Activity },
    { to: "/profile-metrics", label: "Profile metrics", icon: Gauge },
    { to: "/training-preferences", label: "Training preferences", icon: SlidersHorizontal },
    { to: "/integrations", label: "Integrations", icon: Plug },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  const handleSignOut = async () => {
    setIsPending(true);
    try {
      await signOut();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full p-0"
          aria-label="Open user menu"
          title="Open user menu"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {getInitials(user?.email)}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {user?.id ? (
            <DropdownMenuItem asChild>
              <Link
                to="/user/$userId"
                params={{ userId: user.id }}
                search={{ flash: undefined, flashType: undefined }}
                className="cursor-pointer"
              >
                <UserRound className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          {accountLinks.map(({ to, label, icon: Icon }) => (
            <DropdownMenuItem key={to} asChild>
              <Link to={to} className="cursor-pointer">
                <Icon className="mr-2 h-4 w-4" />
                <span>{label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild disabled={isPending} className="cursor-pointer">
          <form
            action={signOutAction.url}
            method="post"
            onSubmit={handleSignOut}
            className="w-full"
          >
            <button type="submit" className="flex w-full items-center gap-2" disabled={isPending}>
              <LogOut className="h-4 w-4" />
              <span>{isPending ? "Logging out..." : "Log out"}</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
