import { invalidateRelationshipQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Clock, Ellipsis, MessageCircle, UserMinus, UserPlus } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ProfileGroupsSection } from "@/components/profile/ProfileGroupsSection";
import { ProfileSummaryCard } from "@/components/profile/ProfileSummaryCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function UserDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user, profile } = useAuth();
  const utils = api.useUtils();

  const targetUserId = typeof userId === "string" ? userId : "";
  const isOwnProfile = !!user?.id && user.id === targetUserId;

  useEffect(() => {
    if (isOwnProfile) {
      router.replace(ROUTES.PROFILE_SETTINGS as any);
    }
  }, [isOwnProfile, router]);

  const {
    data: targetProfile,
    error,
    isLoading,
  } = api.profiles.getPublicById.useQuery(
    { id: targetUserId },
    { enabled: targetUserId.length > 0 && !isOwnProfile },
  );

  const renderedProfile = useMemo(() => {
    if (isOwnProfile && profile) {
      return {
        ...profile,
        followers_count: targetProfile?.followers_count ?? profile.followers_count ?? 0,
        following_count: targetProfile?.following_count ?? profile.following_count ?? 0,
        follow_status: targetProfile?.follow_status ?? profile.follow_status ?? null,
      };
    }

    return targetProfile;
  }, [isOwnProfile, profile, targetProfile]);

  const canViewSocialGraph =
    !!renderedProfile &&
    (isOwnProfile ||
      renderedProfile.is_public !== false ||
      renderedProfile.follow_status === "accepted");

  const followMutation = api.social.followUser.useMutation({
    onSuccess: async () => invalidateRelationshipQueries(utils, [targetUserId, user?.id]),
    onError: (err) => Alert.alert("Error", err.message || "Failed to follow"),
  });

  const unfollowMutation = api.social.unfollowUser.useMutation({
    onSuccess: async () => invalidateRelationshipQueries(utils, [targetUserId, user?.id]),
    onError: (err) => Alert.alert("Error", err.message || "Failed to unfollow"),
  });

  const messageMutation = api.messaging.getOrCreateDM.useMutation({
    onSuccess: (data) => {
      if (data && "id" in data) {
        navigateTo(`/messages/${(data as any).id}` as any);
      }
    },
    onError: (err) => Alert.alert("Error", err.message || "Failed to start message"),
  });

  const renderHeaderActions = () =>
    isOwnProfile ? (
      <DropdownMenu>
        <DropdownMenuTrigger testID="user-detail-options-trigger">
          <View className="mr-2 rounded-full p-2">
            <Icon as={Ellipsis} size={18} className="text-foreground" />
          </View>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          <DropdownMenuItem
            onPress={() => navigateTo(ROUTES.PROFILE_EDIT as any)}
            testID="user-detail-options-edit"
          >
            <Text>Edit Profile</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  if (!targetUserId) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Invalid user id.</Text>
      </View>
    );
  }

  if (isOwnProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Opening profile settings...</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Loading profile...</Text>
      </View>
    );
  }

  if (error) {
    const isNotFound = error.data?.code === "NOT_FOUND";
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-base font-semibold text-foreground">
          {isNotFound ? "Profile not found" : "Unable to load profile"}
        </Text>
        {!isNotFound ? (
          <Text className="mt-2 text-sm text-muted-foreground">Please try again.</Text>
        ) : null}
      </View>
    );
  }

  if (!renderedProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Profile unavailable.</Text>
      </View>
    );
  }

  const supportingText = isOwnProfile
    ? "This is how your public profile appears to other athletes. Account tools live in the Profile tab."
    : renderedProfile.is_public
      ? "Open profile details, then follow or message if this looks like the right connection."
      : "This profile stays private until your follow request is accepted.";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      showsVerticalScrollIndicator={false}
      testID="user-detail-screen"
    >
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />

      <ProfileSummaryCard
        actions={
          !isOwnProfile ? (
            <View className="flex-row gap-3">
              {renderedProfile.follow_status === "accepted" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => unfollowMutation.mutate({ target_user_id: targetUserId })}
                  className="flex-row gap-2"
                  disabled={unfollowMutation.isPending}
                  testID="user-detail-unfollow-button"
                >
                  <Icon as={UserMinus} size={16} />
                  <Text>Unfollow</Text>
                </Button>
              ) : renderedProfile.follow_status === "pending" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => unfollowMutation.mutate({ target_user_id: targetUserId })}
                  className="flex-row gap-2"
                  disabled={unfollowMutation.isPending}
                  testID="user-detail-requested-button"
                >
                  <Icon as={Clock} size={16} />
                  <Text>Requested</Text>
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onPress={() => followMutation.mutate({ target_user_id: targetUserId })}
                  className="flex-row gap-2"
                  disabled={followMutation.isPending}
                  testID="user-detail-follow-button"
                >
                  <Icon as={UserPlus} size={16} />
                  <Text>Follow</Text>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onPress={() => messageMutation.mutate({ target_user_id: targetUserId })}
                className="flex-row gap-2"
                disabled={messageMutation.isPending}
                testID="user-detail-message-button"
              >
                <Icon as={MessageCircle} size={16} />
                <Text>Message</Text>
              </Button>
            </View>
          ) : null
        }
        emailFallback={isOwnProfile ? user?.email : null}
        isOwnProfile={isOwnProfile}
        onEdit={isOwnProfile ? () => navigateTo(ROUTES.PROFILE_EDIT as any) : undefined}
        onFollowersPress={
          canViewSocialGraph
            ? () => navigateTo(`/followers?userId=${targetUserId}` as any)
            : undefined
        }
        onFollowingPress={
          canViewSocialGraph
            ? () => navigateTo(`/following?userId=${targetUserId}` as any)
            : undefined
        }
        profile={renderedProfile}
        showMetadata={
          renderedProfile.is_public !== false ||
          isOwnProfile ||
          renderedProfile.follow_status === "accepted"
        }
        supportingText={supportingText}
        testID="user-detail-summary"
      />

      <ProfileGroupsSection profileId={targetUserId} testID="user-detail-groups" />

      {!isOwnProfile &&
      renderedProfile.is_public === false &&
      renderedProfile.follow_status !== "accepted" ? (
        <View className="items-center rounded-3xl border border-border bg-card px-6 py-8">
          <Text className="text-base font-semibold text-foreground">This account is private</Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Follow this account to see their activities and profile details.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function UserDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <UserDetailScreen />
    </ErrorBoundary>
  );
}
