"use client";

import { Button } from "@repo/ui/components/button";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./providers/auth-provider";
import { UserNav } from "./user-nav";

const Navbar = () => {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith("/auth") ?? false;

  if (isAuthenticated && !isAuthRoute) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-30 flex w-full items-center justify-between border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/images/icons/splash-icon-prod.svg"
          className="dark:invert"
          height={32}
          width={32}
          alt="GradientPeak"
        />
        <span className="text-lg font-semibold tracking-tighter">GradientPeak</span>
      </Link>

      <div className="flex items-center gap-2">
        {isAuthenticated && (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Dashboard</Link>
            </Button>
            <UserNav />
          </>
        )}

        {!isAuthenticated && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/sign-up">Sign up</Link>
            </Button>
          </>
        )}
      </div>
    </nav>
  );
};

export { Navbar };
