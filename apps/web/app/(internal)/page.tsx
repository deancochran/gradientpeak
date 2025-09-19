"use client";

import { useAuth } from "@/components/providers/auth-provider";

export default function ProtectedPage() {
  const { user } = useAuth();

  return (
    <div className="flex h-svh w-full items-center justify-center gap-2">
      <p>
        Hello <span>{user?.email}</span>
      </p>
    </div>
  );
}
