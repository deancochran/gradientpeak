import { Button } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function RelationshipPageShell({
  activeTab,
  children,
  userId,
}: {
  activeTab: "followers" | "following";
  children: ReactNode;
  userId: string;
}) {
  return (
    <main className="container max-w-3xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Profile relationships" className="flex gap-2">
          <Button asChild variant={activeTab === "followers" ? "default" : "outline"}>
            <Link
              aria-current={activeTab === "followers" ? "page" : undefined}
              to="/user/$userId/followers"
              params={{ userId }}
              search={{ cursor: undefined, flash: undefined, flashType: undefined }}
            >
              Followers
            </Link>
          </Button>
          <Button asChild variant={activeTab === "following" ? "default" : "outline"}>
            <Link
              aria-current={activeTab === "following" ? "page" : undefined}
              to="/user/$userId/following"
              params={{ userId }}
              search={{ cursor: undefined, flash: undefined, flashType: undefined }}
            >
              Following
            </Link>
          </Button>
        </nav>
        <Button asChild variant="ghost">
          <Link
            to="/user/$userId"
            params={{ userId }}
            search={{ flash: undefined, flashType: undefined }}
          >
            Back to profile
          </Link>
        </Button>
      </div>
      {children}
    </main>
  );
}
