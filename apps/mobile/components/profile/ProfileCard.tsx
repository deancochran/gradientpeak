import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { Image, Pressable, View } from "react-native";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

export type ProfileCardProfile = {
  avatar_url?: string | null;
  bio?: string | null;
  cover_url?: string | null;
  followers_count?: number | null;
  following_count?: number | null;
  full_name?: string | null;
  id?: string | null;
  is_public?: boolean | null;
  username?: string | null;
};

export type ProfileCardProps = {
  actions?: ReactNode;
  disabled?: boolean;
  emailFallback?: string | null;
  onPress?: () => void;
  profile: ProfileCardProfile;
  selected?: boolean;
  supportingText?: string | null;
  testID?: string;
};

function getProfileInitial(profile: ProfileCardProfile, emailFallback?: string | null) {
  return (
    profile.full_name?.trim().charAt(0)?.toUpperCase() ||
    profile.username?.charAt(0)?.toUpperCase() ||
    emailFallback?.charAt(0)?.toUpperCase() ||
    "A"
  );
}

function getDisplayName(profile: ProfileCardProfile, emailFallback?: string | null) {
  return profile.full_name?.trim() || profile.username || emailFallback?.split("@")[0] || "Athlete";
}

export function ProfileCard({
  actions,
  disabled,
  emailFallback,
  onPress,
  profile,
  selected,
  supportingText,
  testID = "profile-card",
}: ProfileCardProps) {
  const avatarUri = profile.avatar_url ? getReachableSupabaseStorageUrl(profile.avatar_url) : null;
  const coverUri = profile.cover_url ? getReachableSupabaseStorageUrl(profile.cover_url) : null;
  const displayName = getDisplayName(profile, emailFallback);
  const usernameLabel = profile.username ? `@${profile.username}` : null;
  const visibilityLabel = profile.is_public ? "Public profile" : "Private profile";
  const isDisabled = disabled ?? !onPress;

  return (
    <Card
      className={`overflow-hidden rounded-3xl border bg-card ${selected ? "border-primary" : "border-border"}`}
      testID={testID}
    >
      {coverUri ? (
        <Image
          accessibilityLabel="Profile cover photo"
          className="h-28 w-full bg-muted"
          resizeMode="cover"
          source={{ uri: coverUri }}
        />
      ) : null}
      <CardContent className="gap-4 p-4">
        <Pressable
          accessibilityLabel={`${selected ? "Deselect" : "Select"} profile ${displayName}`}
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityState={{ disabled: isDisabled, selected }}
          className="flex-row items-start gap-3"
          disabled={isDisabled}
          onPress={isDisabled ? undefined : onPress}
          testID={`${testID}-identity`}
        >
          <Avatar alt={displayName} className="h-16 w-16">
            {avatarUri ? <AvatarImage key={avatarUri} source={{ uri: avatarUri }} /> : null}
            <AvatarFallback>
              <Text className="text-xl font-semibold text-muted-foreground">
                {getProfileInitial(profile, emailFallback)}
              </Text>
            </AvatarFallback>
          </Avatar>

          <View className="min-w-0 flex-1 gap-2">
            <View className="gap-0.5">
              <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
                {displayName}
              </Text>
              {usernameLabel ? (
                <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                  {usernameLabel}
                </Text>
              ) : null}
            </View>

            <View className="flex-row flex-wrap items-center gap-2">
              <View className="rounded-full border border-border bg-muted/20 px-2.5 py-1">
                <Text className="text-xs font-medium text-foreground">{visibilityLabel}</Text>
              </View>
            </View>
          </View>
        </Pressable>

        {profile.bio ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={3}>
            {profile.bio}
          </Text>
        ) : supportingText ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={3}>
            {supportingText}
          </Text>
        ) : null}

        {profile.followers_count != null || profile.following_count != null ? (
          <View className="flex-row gap-3">
            {profile.followers_count != null ? (
              <ProfileCardStat label="Followers" value={profile.followers_count} />
            ) : null}
            {profile.following_count != null ? (
              <ProfileCardStat label="Following" value={profile.following_count} />
            ) : null}
          </View>
        ) : null}

        {actions ? <View className="gap-2">{actions}</View> : null}
      </CardContent>
    </Card>
  );
}

function ProfileCardStat({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-muted/20 px-3 py-2.5">
      <Text className="text-base font-semibold text-foreground">{value}</Text>
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}
