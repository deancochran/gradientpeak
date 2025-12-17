"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

export function CurrentUserAvatar() {
  const { user } = useAuth();
  const { data: profile } = trpc.profiles.get.useQuery(undefined, {
    enabled: !!user,
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Get signed URL for avatar
  const { data: avatarData } = trpc.storage.getSignedUrl.useQuery(
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
    <Avatar className="h-8 w-8">
      <AvatarImage src={avatarUrl || ""} alt={profile?.username || "User"} />
      <AvatarFallback className="text-sm">
        {profile?.username ? (
          getInitials(profile.username)
        ) : (
          <UserRound className="h-4 w-4" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
