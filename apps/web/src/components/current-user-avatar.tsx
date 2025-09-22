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

  // Get avatar URL when profile changes
  useEffect(() => {
    const getAvatarUrl = async (path: string) => {
      try {
        const { signedUrl } = await trpc.storage.getSignedUrl.query({
          filePath: path,
        });
        setAvatarUrl(signedUrl);
      } catch (error) {
        console.error("Error getting avatar URL:", error);
        setAvatarUrl(null);
      }
    };

    if (profile?.avatar_url) {
      getAvatarUrl(profile.avatar_url);
    } else {
      setAvatarUrl(null);
    }
  }, [profile?.avatar_url]);

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
