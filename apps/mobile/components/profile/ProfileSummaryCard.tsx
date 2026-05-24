import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { Image, TouchableOpacity, View } from "react-native";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

export type ProfileSummary = {
  avatar_url?: string | null;
  bio?: string | null;
  cover_url?: string | null;
  dob?: string | null;
  followers_count?: number | null;
  following_count?: number | null;
  gender?: string | null;
  is_public?: boolean | null;
  language?: string | null;
  preferred_units?: string | null;
  username?: string | null;
};

type ProfileSummaryCardProps = {
  actions?: ReactNode;
  emailFallback?: string | null;
  isOwnProfile?: boolean;
  onEdit?: () => void;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
  onProfilePress?: () => void;
  profile: ProfileSummary;
  showMetadata?: boolean;
  supportingText?: string | null;
  testID?: string;
};

function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) return null;

  const today = new Date();
  let years = today.getFullYear() - dobDate.getFullYear();
  const monthDelta = today.getMonth() - dobDate.getMonth();
  const hasBirthdayPassed =
    monthDelta > 0 || (monthDelta === 0 && today.getDate() >= dobDate.getDate());
  if (!hasBirthdayPassed) years -= 1;
  return years;
}

function formatProfileFallback(profile: ProfileSummary, emailFallback?: string | null) {
  return (
    profile.username?.charAt(0)?.toUpperCase() || emailFallback?.charAt(0)?.toUpperCase() || "A"
  );
}

export function ProfileSummaryCard({
  actions,
  emailFallback,
  isOwnProfile = false,
  onEdit,
  onFollowersPress,
  onFollowingPress,
  onProfilePress,
  profile,
  showMetadata = false,
  supportingText,
  testID,
}: ProfileSummaryCardProps) {
  const avatarUri = profile.avatar_url ? getReachableSupabaseStorageUrl(profile.avatar_url) : null;
  const coverUri = profile.cover_url ? getReachableSupabaseStorageUrl(profile.cover_url) : null;
  const displayName = profile.username || emailFallback?.split("@")[0] || "Athlete";
  const usernameLabel = profile.username ? `@${profile.username}` : null;
  const age = calculateAge(profile.dob);
  const hasProfileMetadata =
    !!profile.bio ||
    age !== null ||
    !!profile.gender ||
    !!profile.preferred_units ||
    !!profile.language;

  return (
    <Card className="overflow-hidden rounded-3xl border border-border bg-card" testID={testID}>
      {coverUri ? (
        <Image
          accessibilityLabel="Profile cover photo"
          className="h-36 w-full"
          resizeMode="cover"
          source={{ uri: coverUri }}
        />
      ) : null}
      <CardContent className="gap-5 p-6">
        <TouchableOpacity
          accessibilityRole={onProfilePress ? "button" : undefined}
          activeOpacity={onProfilePress ? 0.85 : 1}
          className="flex-row items-start gap-4"
          disabled={!onProfilePress}
          onPress={onProfilePress}
          testID={testID ? `${testID}-identity` : "profile-summary-identity"}
        >
          <Avatar alt={profile.username || "User profile"} className="h-24 w-24">
            {avatarUri ? <AvatarImage source={{ uri: avatarUri }} key={avatarUri} /> : null}
            <AvatarFallback>
              <Text className="text-3xl font-semibold text-muted-foreground">
                {formatProfileFallback(profile, emailFallback)}
              </Text>
            </AvatarFallback>
          </Avatar>

          <View className="min-w-0 flex-1 gap-2">
            <View className="gap-1">
              <Text className="text-2xl font-semibold text-foreground" numberOfLines={2}>
                {displayName}
              </Text>
              {usernameLabel ? (
                <Text className="text-sm text-muted-foreground">{usernameLabel}</Text>
              ) : null}
            </View>

            <View className="flex-row flex-wrap items-center gap-2">
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium text-foreground">
                  {profile.is_public ? "Public profile" : "Private profile"}
                </Text>
              </View>
              {isOwnProfile ? (
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">Your account</Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        {supportingText ? (
          <Text className="text-sm text-muted-foreground">{supportingText}</Text>
        ) : null}

        <View className="flex-row gap-3">
          <ProfileStatButton
            disabled={!onFollowersPress}
            label="Followers"
            onPress={onFollowersPress}
            testID={testID ? `${testID}-followers` : "profile-summary-followers"}
            value={profile.followers_count ?? 0}
          />
          <ProfileStatButton
            disabled={!onFollowingPress}
            label="Following"
            onPress={onFollowingPress}
            testID={testID ? `${testID}-following` : "profile-summary-following"}
            value={profile.following_count ?? 0}
          />
        </View>

        {onEdit ? (
          <Button variant="outline" onPress={onEdit} testID={testID ? `${testID}-edit` : undefined}>
            <Text>Edit Profile</Text>
          </Button>
        ) : null}

        {actions ? <View className="gap-3">{actions}</View> : null}

        {showMetadata && hasProfileMetadata ? (
          <View className="gap-3 border-t border-border pt-4">
            {profile.bio ? (
              <View>
                <Text className="mb-1 text-xs uppercase text-muted-foreground">Bio</Text>
                <Text className="text-sm text-foreground">{profile.bio}</Text>
              </View>
            ) : null}

            <View className="flex-row flex-wrap gap-4">
              {age !== null ? <ProfileMetadataItem label="Age" value={`${age} years`} /> : null}
              {profile.gender ? (
                <ProfileMetadataItem label="Gender" value={profile.gender} />
              ) : null}
              {profile.preferred_units ? (
                <ProfileMetadataItem label="Units" value={profile.preferred_units} />
              ) : null}
              {profile.language ? (
                <ProfileMetadataItem label="Language" value={profile.language.toUpperCase()} />
              ) : null}
            </View>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProfileStatButton({
  disabled,
  label,
  onPress,
  testID,
  value,
}: {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  testID: string;
  value: number;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      className="flex-1 rounded-xl border border-border bg-muted/20 px-4 py-3"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Text className="text-base font-semibold text-foreground">{value}</Text>
      <Text className="text-xs font-medium text-primary">{label}</Text>
    </TouchableOpacity>
  );
}

function ProfileMetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1">
      <Text className="mb-1 text-xs uppercase text-muted-foreground">{label}</Text>
      <Text className="text-sm font-medium capitalize text-foreground">{value}</Text>
    </View>
  );
}
