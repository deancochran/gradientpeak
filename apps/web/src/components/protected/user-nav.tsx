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
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Home, LogOut, MessageSquare, Settings, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { authClient } from "../../lib/auth/client";
import { useAuth } from "../providers/auth-provider";

function getInitials(email: string | null | undefined) {
  if (!email) return "GP";
  return email.slice(0, 2).toUpperCase();
}

export function UserNav() {
  const { user, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const displayName = user?.email ?? "User";
  type AccountLink = {
    icon: typeof Home;
    label: string;
    to: "/" | "/coaching" | "/messages" | "/notifications" | "/settings";
  };
  const accountLinks: AccountLink[] = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/coaching", label: "Coaching", icon: Users },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  const handleSignOut = async () => {
    setIsPending(true);
    try {
      const result = await authClient.signOut();

      if (result.error) {
        throw result.error;
      }

      await refreshSession();
      await navigate({ to: "/auth/login" });
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
              <Link to="/user/$userId" params={{ userId: user.id }} className="cursor-pointer">
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
        <DropdownMenuItem
          disabled={isPending}
          onClick={() => void handleSignOut()}
          className="cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{isPending ? "Logging out..." : "Log out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
