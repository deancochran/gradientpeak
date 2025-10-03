"use client";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { House, LogOut, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CurrentUserAvatar } from "./current-user-avatar";
import { useAuth } from "./providers/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
const Navbar = () => {
  const router = useRouter();
  const { isAuthenticated, refreshSession } = useAuth();
  const signOutMutation = trpc.auth.signOut.useMutation();
  const logout = async () => {
    try {
      await signOutMutation.mutateAsync();
      // Refresh session to clear user data
      refreshSession();
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <nav className="w-full p-4 flex justify-between">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <Image
          src="/images/icons/splash-icon-prod.svg"
          className="dark:invert"
          height={32}
          width={32}
          alt="Logo"
        />
        <span className="text-lg font-semibold tracking-tighter">
          GradientPeak
        </span>
      </div>

      <div className="flex gap-2">
        {/* Show avatar only if user is authenticated */}
        {isAuthenticated && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="overflow-hidden rounded-full cursor-pointer"
              >
                <CurrentUserAvatar />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full justify-start  cursor-pointer"
                  >
                    <Link href="/" className="text-popover-foreground">
                      <House />
                      Dashboard
                    </Link>
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full justify-start  cursor-pointer"
                  >
                    <Link href="/settings" className="text-popover-foreground">
                      <Settings />
                      Settings
                    </Link>
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={logout}
                    variant="ghost"
                    className="w-full justify-start cursor-pointer"
                  >
                    <LogOut />
                    <span className="text-popover-foreground">Sign Out</span>
                  </Button>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Show login/signup buttons only if user is NOT authenticated */}
        {!isAuthenticated && (
          <>
            <Button asChild variant="outline">
              <a href="/auth/login">Login</a>
            </Button>
            <Button asChild>
              <a href="/auth/sign-up">Signup</a>
            </Button>
          </>
        )}
      </div>
    </nav>
  );
};

export { Navbar };
