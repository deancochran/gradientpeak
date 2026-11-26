import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
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
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  MessageSquare,
  Plug,
  Settings,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";

import { api } from "../../lib/api/client";
import { signOutAction } from "../../lib/auth/server-actions";
import { contractEpochFormInputProps } from "../../lib/contract-epoch";
import { useFormServerFn } from "../../lib/use-form-server-fn";
import { useAuth } from "../providers/auth-provider";

function getInitials(email: string | null | undefined) {
  if (!email) return "GP";
  return email.slice(0, 2).toUpperCase();
}

export function UserNav() {
  const { user } = useAuth();
  return <AccountUserNav key={user?.id ?? "anonymous"} />;
}

function AccountUserNav() {
  const { user } = useAuth();
  const { data: profile } = api.profiles.get.useQuery(undefined, {
    enabled: Boolean(user?.id),
  });
  const signOut = useFormServerFn(signOutAction, () => undefined, user?.id);
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const displayName = user?.email ?? "User";
  type AccountLink = {
    icon: typeof Home;
    label: string;
    to:
      | "/"
      | "/activity-plans"
      | "/goals"
      | "/groups"
      | "/integrations"
      | "/messages"
      | "/notifications"
      | "/organizations"
      | "/calendar"
      | "/training-plans"
      | "/settings";
  };
  const accountLinks: AccountLink[] = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/organizations", label: "Coaching organizations", icon: Building2 },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/activity-plans", label: "Activity plans", icon: ClipboardList },
    { to: "/training-plans", label: "Training plans", icon: ClipboardList },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/goals", label: "Goals", icon: Target },
    { to: "/groups", label: "Groups", icon: Users },
    { to: "/integrations", label: "Integrations", icon: Plug },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  const handleSignOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    void new FormData(event.currentTarget);
    pendingRef.current = true;
    setIsPending(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      pendingRef.current = false;
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
          <Avatar className="h-8 w-8">
            {profile?.avatar_url ? (
              <AvatarImage alt="Your profile" src={profile.avatar_url} />
            ) : null}
            <AvatarFallback>{getInitials(profile?.username ?? user?.email)}</AvatarFallback>
          </Avatar>
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
        <DropdownMenuItem
          asChild
          disabled={isPending}
          onSelect={(event) => event.preventDefault()}
          className="cursor-pointer"
        >
          <form
            action={signOutAction.url}
            method="post"
            onSubmit={(event) => void handleSignOut(event)}
            className="w-full"
          >
            <input {...contractEpochFormInputProps} />
            <button type="submit" className="flex w-full items-center gap-2" disabled={isPending}>
              <LogOut className="h-4 w-4" />
              <span>{isPending ? "Logging out..." : "Log out"}</span>
            </button>
          </form>
        </DropdownMenuItem>
        {signOutError ? (
          <p className="px-2 text-sm text-destructive" role="alert">
            {signOutError}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
