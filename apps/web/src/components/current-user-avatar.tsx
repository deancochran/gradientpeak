"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { cn } from "@repo/ui/lib/cn";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { api } from "@/lib/api/client";

type CurrentUserAvatarProps = {
  className?: string;
  fallbackClassName?: string;
};

export function CurrentUserAvatar({ className, fallbackClassName }: CurrentUserAvatarProps = {}) {
  const { user } = useAuth();
  const { data: profile } = api.profiles.get.useQuery(undefined, {
    enabled: !!user,
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Get signed URL for avatar
  const { data: avatarData } = api.storage.getSignedUrl.useQuery(
    { filePath: profile?.avatar_url || "" },
    {
      enabled: !!profile?.avatar_url,
      refetchOnWindowFocus: false,
    },
  );

  // Update avatar URL when data changes
  useEffect(() => {
    if (avatarData?.signedUrl) {
      setAvatarUrl(avatarData.signedUrl);
    } else {
      setAvatarUrl(null);
    }
  }, [avatarData?.signedUrl]);

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Avatar className={cn("h-8 w-8", className)}>
      <AvatarImage src={avatarUrl || ""} alt={profile?.username || "User"} />
      <AvatarFallback className={cn("text-sm", fallbackClassName)}>
        {profile?.username ? getInitials(profile.username) : <UserRound className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
