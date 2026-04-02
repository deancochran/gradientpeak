"use client";

import { Loader2 } from "lucide-react";
import { useRedirectIfAuthenticated } from "@/components/providers/auth-provider";

export function ExternalAuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading } = useRedirectIfAuthenticated("/");

  if (isLoading) {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
