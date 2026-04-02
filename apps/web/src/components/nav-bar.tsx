"use client";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { House, LogOut, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { CurrentUserAvatar } from "./current-user-avatar";
import { useAuth } from "./providers/auth-provider";

const Navbar = () => {
  const router = useRouter();
  const { isAuthenticated, refreshSession } = useAuth();
  const [isPending, setIsPending] = useState(false);
  const logout = async () => {
    setIsPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        throw result.error;
      }
      await refreshSession();
      router.refresh();
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsPending(false);
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
        <span className="text-lg font-semibold tracking-tighter">GradientPeak</span>
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
                  <Button asChild variant="ghost" className="w-full justify-start  cursor-pointer">
                    <Link href="/" className="text-popover-foreground">
                      <House />
                      Dashboard
                    </Link>
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button asChild variant="ghost" className="w-full justify-start  cursor-pointer">
                    <Link href="/settings" className="text-popover-foreground">
                      <Settings />
                      Settings
                    </Link>
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={logout}
                    disabled={isPending}
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
