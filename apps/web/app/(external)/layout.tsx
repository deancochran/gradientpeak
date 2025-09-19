"use client";

import { useRedirectIfAuthenticated } from "@/components/providers/auth-provider";
import { Loader2 } from "lucide-react";

export default function ExternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
