import { invalidateRelationshipQueries } from "@repo/api/react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { SettingItem, SettingsGroup } from "@repo/ui/components/settings-group";
import { Text } from "@repo/ui/components/text";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Clock, Ellipsis, MessageCircle, UserMinus, UserPlus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";

const themeOptions = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

const integrationProviderLabels: Record<string, string> = {
  garmin: "Garmin Connect",
  strava: "Strava",
  trainingpeaks: "TrainingPeaks",
  wahoo: "Wahoo",
  zwift: "Zwift",
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

function UserDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const {
    user,
    profile,
    deleteAccount,
    updateEmail,
    updatePassword,
    canUpdateEmail,
    updateEmailUnavailableReason,
  } = useAuth();
  const authStore = useAuthStore();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const utils = api.useUtils();

  const targetUserId = typeof userId === "string" ? userId : "";
  const isOwnProfile = !!user?.id && user?.id === targetUserId;

  // Fetch public profile data (includes follower counts)
  const {
    data: targetProfile,
    isLoading,
    error,
  } = api.profiles.getPublicById.useQuery(
    { id: targetUserId },
    { enabled: targetUserId.length > 0 },
  );
  const { data: integrations = [] } = api.integrations.list.useQuery(undefined, {
    enabled: isOwnProfile,
  });

  // Merge profile data: use auth profile for own profile (has dob), merge in counts from getPublicById
  const renderedProfile = useMemo(() => {
    if (isOwnProfile && profile) {
      // For own profile, use auth profile but merge in counts from targetProfile
      return {
        ...profile,
        followers_count: targetProfile?.followers_count ?? profile.followers_count ?? 0,
        following_count: targetProfile?.following_count ?? profile.following_count ?? 0,
        follow_status: targetProfile?.follow_status ?? profile.follow_status ?? null,
      };
    }
    return targetProfile;
  }, [isOwnProfile, profile, targetProfile]);

  const [isEmailUpdateVisible, setIsEmailUpdateVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isPasswordChangeVisible, setIsPasswordChangeVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showDeleteAccountFinalConfirm, setShowDeleteAccountFinalConfirm] = useState(false);
  const [statusModal, setStatusModal] = useState<null | {
    title: string;
    description: string;
    onClose?: () => void;
  }>(null);

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

  const handleSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const handleDeleteAccount = () => {
    setShowDeleteAccountConfirm(true);
  };

  const confirmSignOut = async () => {
    try {
      setIsSigningOut(true);
      await authStore.clearSession();
      await utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);
    } catch (error) {
      setStatusModal({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sign out",
      });
    } finally {
      setIsSigningOut(false);
      setShowSignOutConfirm(false);
    }
  };

  const confirmDeleteAccount = async () => {
    try {
      await deleteAccount();
      await authStore.clearSession();
      await utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);
      setShowDeleteAccountFinalConfirm(false);
      setStatusModal({
        title: "Account Deleted",
        description: "Your account has been successfully deleted.",
      });
    } catch (error) {
      setStatusModal({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete account. Please contact support.",
      });
    }
  };

  const handleUpdatePassword = () => {
    if (!currentPassword.trim()) {
      Alert.alert("Error", "Please enter your current password");
      return;
    }
    if (!newPassword.trim()) {
      Alert.alert("Error", "Please enter a new password");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    if (currentPassword === newPassword) {
      Alert.alert("Error", "New password must be different from current password");
      return;
    }

    void updatePassword({ currentPassword, newPassword })
      .then(() => {
        Alert.alert("Password Updated", "Your password has been successfully changed.");
        setIsPasswordChangeVisible(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((error) => {
        Alert.alert("Error", error instanceof Error ? error.message : "Failed to update password");
      });
  };

  const handleUpdateEmail = () => {
    if (!newEmail.trim()) {
      Alert.alert("Error", "Please enter a new email address");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    void updateEmail({ newEmail })
      .then(() => {
        Alert.alert(
          "Verification Sent",
          `We sent email change instructions for ${newEmail}. Follow the link in your inbox to complete the update.`,
        );
        setIsEmailUpdateVisible(false);
        setNewEmail("");
      })
      .catch((error: unknown) => {
        Alert.alert("Error", error instanceof Error ? error.message : "Failed to update email");
      });
  };

  if (!targetUserId) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Invalid user id.</Text>
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
        {!isNotFound && (
          <Text className="mt-2 text-sm text-muted-foreground">Please try again.</Text>
        )}
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

  const age = calculateAge(renderedProfile.dob);
  const hasProfileMetadata =
    !!renderedProfile?.bio ||
    age !== null ||
    !!renderedProfile?.gender ||
    !!renderedProfile?.preferred_units ||
    !!renderedProfile?.language;
  const displayName = renderedProfile?.username || user?.email?.split("@")[0] || "Unknown user";
  const usernameLabel = renderedProfile?.username ? `@${renderedProfile.username}` : null;
  const quickLinks = [
    {
      testID: "my-activities",
      title: "My Activities",
      description: "Completed workouts",
      onPress: () => navigateTo(ROUTES.ACTIVITIES.LIST as any),
    },
    {
      testID: "my-training-plans",
      title: "My Training Plans",
      description: "Saved training plans",
      onPress: () => navigateTo(ROUTES.PLAN.TRAINING_PLAN.LIST as any),
    },
    {
      testID: "my-activity-plans",
      title: "My Activity Plans",
      description: "Saved activity plans",
      onPress: () => navigateTo(ROUTES.PLAN.ACTIVITY_PLAN_LIST as any),
    },
    {
      testID: "my-routes",
      title: "My Routes",
      description: "Saved routes",
      onPress: () => navigateTo(ROUTES.ROUTES.LIST as any),
    },
    {
      testID: "my-activity-efforts",
      title: "My Activity Efforts",
      description: "Capability efforts",
      onPress: () => navigateTo(ROUTES.ACTIVITIES.EFFORTS_LIST as any),
    },
    {
      testID: "my-profile-metrics",
      title: "My Profile Metrics",
      description: "Saved profile metrics",
      onPress: () => navigateTo(ROUTES.PROFILE_METRICS.LIST as any),
    },
  ] as const;

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

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="p-6 gap-6"
        showsVerticalScrollIndicator={false}
        testID="user-detail-screen"
      >
        <Stack.Screen options={{ headerRight: renderHeaderActions }} />

        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-5 p-6">
            <View className="flex-row items-start gap-4">
              <Avatar alt={renderedProfile?.username || "User"} className="h-24 w-24">
                {renderedProfile?.avatar_url ? (
                  <AvatarImage
                    source={{ uri: renderedProfile.avatar_url }}
                    key={renderedProfile.avatar_url}
                  />
                ) : null}
                <AvatarFallback>
                  <Text className="text-3xl">
                    {renderedProfile?.username?.charAt(0)?.toUpperCase() ||
                      (isOwnProfile ? user?.email?.charAt(0)?.toUpperCase() : null) ||
                      "U"}
                  </Text>
                </AvatarFallback>
              </Avatar>

              <View className="flex-1 gap-2">
                <View className="gap-1">
                  <Text className="text-2xl font-semibold text-foreground">{displayName}</Text>
                  {usernameLabel ? (
                    <Text className="text-sm text-muted-foreground">{usernameLabel}</Text>
                  ) : null}
                  {isOwnProfile && user?.email ? (
                    <Text className="text-sm text-muted-foreground">{user.email}</Text>
                  ) : null}
                </View>

                <View className="flex-row flex-wrap items-center gap-2">
                  <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                    <Text className="text-xs font-medium text-foreground">
                      {renderedProfile?.is_public ? "Public profile" : "Private profile"}
                    </Text>
                  </View>
                  {isOwnProfile ? (
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">Your account</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <Text className="text-sm text-muted-foreground">
              {isOwnProfile
                ? "Your public profile summary lives here. Account tools stay below so profile details remain easy to scan."
                : renderedProfile?.is_public
                  ? "Open profile details, then follow or message if this looks like the right connection."
                  : "This profile stays private until your follow request is accepted."}
            </Text>

            <View className="flex-row gap-3">
              <TouchableProfileStat
                label="Followers"
                value={renderedProfile?.followers_count ?? 0}
                onPress={() => navigateTo(`/followers?userId=${targetUserId}` as any)}
              />
              <TouchableProfileStat
                label="Following"
                value={renderedProfile?.following_count ?? 0}
                onPress={() => navigateTo(`/following?userId=${targetUserId}` as any)}
              />
            </View>

            {!isOwnProfile && renderedProfile?.follow_status === "pending" && (
              <View className="flex-row items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 dark:bg-amber-900">
                <Icon as={Clock} size={16} className="text-amber-600 dark:text-amber-400" />
                <Text className="text-sm text-amber-700 dark:text-amber-300">
                  Follow request pending
                </Text>
              </View>
            )}

            {!isOwnProfile ? (
              <View className="flex-row gap-3">
                {renderedProfile?.follow_status === "accepted" ? (
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
                ) : renderedProfile?.follow_status === "pending" ? (
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
            ) : null}

            {!isOwnProfile &&
            renderedProfile?.is_public === false &&
            renderedProfile?.follow_status !== "accepted" ? (
              <View className="items-center border-t border-border py-6">
                <Text className="text-base font-semibold text-foreground">
                  This account is private
                </Text>
                <Text className="mt-1 text-center text-sm text-muted-foreground">
                  Follow this account to see their activities and profile details.
                </Text>
              </View>
            ) : hasProfileMetadata ? (
              <View className="gap-3 border-t border-border pt-4">
                {renderedProfile.bio ? (
                  <View>
                    <Text className="mb-1 text-xs uppercase text-muted-foreground">Bio</Text>
                    <Text className="text-sm text-foreground">{renderedProfile.bio}</Text>
                  </View>
                ) : null}

                <View className="flex-row flex-wrap gap-4">
                  {age !== null ? (
                    <View className="min-w-[45%] flex-1">
                      <Text className="mb-1 text-xs uppercase text-muted-foreground">Age</Text>
                      <Text className="text-sm font-medium text-foreground">{age} years</Text>
                    </View>
                  ) : null}

                  {renderedProfile.gender ? (
                    <View className="min-w-[45%] flex-1">
                      <Text className="mb-1 text-xs uppercase text-muted-foreground">Gender</Text>
                      <Text className="text-sm font-medium capitalize text-foreground">
                        {renderedProfile.gender}
                      </Text>
                    </View>
                  ) : null}

                  {renderedProfile.preferred_units ? (
                    <View className="min-w-[45%] flex-1">
                      <Text className="mb-1 text-xs uppercase text-muted-foreground">Units</Text>
                      <Text className="text-sm font-medium capitalize text-foreground">
                        {renderedProfile.preferred_units}
                      </Text>
                    </View>
                  ) : null}

                  {renderedProfile.language ? (
                    <View className="min-w-[45%] flex-1">
                      <Text className="mb-1 text-xs uppercase text-muted-foreground">Language</Text>
                      <Text className="text-sm font-medium uppercase text-foreground">
                        {renderedProfile.language}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </CardContent>
        </Card>

        {isOwnProfile ? (
          <>
            <Card className="rounded-3xl border border-border bg-card" testID="my-records-section">
              <CardContent className="gap-4 p-6">
                <View className="gap-1">
                  <Text className="text-lg font-semibold text-foreground">Quick Links</Text>
                  <Text className="text-sm text-muted-foreground">
                    Open your saved training data without turning this page into a search surface.
                  </Text>
                </View>

                <View className="flex-row flex-wrap gap-3">
                  {quickLinks.map((link) => (
                    <QuickLinkTile key={link.testID} {...link} />
                  ))}
                </View>
              </CardContent>
            </Card>

            <SettingsGroup
              title="My Account"
              description="Email, password, session, and account ownership actions"
              testID="account-section"
            >
              <SettingItem
                type="button"
                label="Email"
                description={user?.email || "Not set"}
                buttonLabel={canUpdateEmail ? "Change" : "Unavailable"}
                variant="outline"
                onPress={() => {
                  if (canUpdateEmail) {
                    setIsEmailUpdateVisible((value) => !value);
                  } else {
                    Alert.alert(
                      "Temporarily unavailable",
                      updateEmailUnavailableReason ?? "Email changes are currently unavailable.",
                    );
                  }
                }}
                disabled={!canUpdateEmail}
                testID="update-email"
              />

              {isEmailUpdateVisible && (
                <View className="bg-card p-4 rounded-lg border border-border mb-4">
                  <Text className="text-sm font-medium mb-3">Update Email Address</Text>
                  <Text className="text-xs text-muted-foreground mb-3">
                    We&apos;ll send a confirmation link to your new email address to complete this
                    change.
                  </Text>
                  <Input
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="New email address"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="mb-3"
                    testID="account-email-input"
                  />
                  <Button onPress={handleUpdateEmail} testID="account-email-submit-button">
                    <Text>Send Verification Email</Text>
                  </Button>
                </View>
              )}

              <SettingItem
                type="button"
                label="Password"
                description="Change your password"
                buttonLabel={isPasswordChangeVisible ? "Cancel" : "Change"}
                variant="outline"
                onPress={() => setIsPasswordChangeVisible(!isPasswordChangeVisible)}
                testID="change-password"
              />

              {isPasswordChangeVisible && (
                <View className="bg-card p-4 rounded-lg border border-border mb-4">
                  <Text className="text-sm font-medium mb-3">Change Your Password</Text>
                  <Input
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Current password"
                    secureTextEntry
                    autoCapitalize="none"
                    className="mb-3"
                    testID="account-current-password-input"
                  />
                  <Input
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password (min 6 characters)"
                    secureTextEntry
                    autoCapitalize="none"
                    className="mb-3"
                    testID="account-new-password-input"
                  />
                  <Input
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    secureTextEntry
                    autoCapitalize="none"
                    className="mb-3"
                    testID="account-confirm-password-input"
                  />
                  <Button onPress={handleUpdatePassword} testID="account-password-submit-button">
                    <Text>Update Password</Text>
                  </Button>
                </View>
              )}

              <SettingItem
                type="custom"
                label="Theme"
                description={`Current: ${resolvedTheme === "dark" ? "Dark" : "Light"}${theme === "system" ? " (System)" : ""}`}
                testID="dark-mode"
              >
                <View className="ml-3 w-[220px] rounded-lg bg-muted p-1">
                  <ToggleGroup
                    type="single"
                    value={theme}
                    onValueChange={(nextValue: string | undefined) => {
                      if (nextValue) {
                        void setTheme(nextValue as "system" | "light" | "dark");
                      }
                    }}
                    className="w-full"
                    testId="theme-toggle-group"
                  >
                    {themeOptions.map((option, index) => {
                      const isSelected = theme === option.value;

                      return (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          testId={`theme-option-${option.value}`}
                          isFirst={index === 0}
                          isLast={index === themeOptions.length - 1}
                          className={`flex-1 px-3 py-2 ${isSelected ? "bg-background" : "bg-transparent"}`}
                        >
                          <Text
                            className={isSelected ? "text-foreground" : "text-muted-foreground"}
                          >
                            {option.label}
                          </Text>
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </View>
              </SettingItem>

              <SettingItem
                type="button"
                label="Sign Out"
                description="Sign out of your account on this device"
                buttonLabel={isSigningOut ? "Signing out..." : "Sign Out"}
                variant="destructive"
                onPress={handleSignOut}
                disabled={isSigningOut}
                testID="sign-out"
              />

              <SettingItem
                type="button"
                label="Delete Account"
                description="Permanently delete your account and all data"
                buttonLabel="Delete"
                variant="destructive"
                onPress={handleDeleteAccount}
                testID="delete-account"
              />
            </SettingsGroup>

            <Card className="rounded-3xl border border-border bg-card" testID="integrations-card">
              <CardContent className="gap-4 p-6">
                <View className="gap-1">
                  <Text className="text-lg font-semibold text-foreground">Integrations</Text>
                  <Text className="text-sm text-muted-foreground">
                    Connection state for your third-party services.
                  </Text>
                </View>

                <View className="gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <View className="gap-1">
                    <Text className="text-sm font-medium text-foreground">
                      {integrations.length > 0
                        ? `${integrations.length} connected ${integrations.length === 1 ? "service" : "services"}`
                        : "No services connected"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {integrations.length > 0
                        ? integrations
                            .map(
                              (integration) =>
                                integrationProviderLabels[integration.provider] ??
                                integration.provider,
                            )
                            .join(", ")
                        : "Connect Strava, Garmin, Wahoo, and other providers from the dedicated integrations screen."}
                    </Text>
                  </View>

                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onPress={() => navigateTo(ROUTES.INTEGRATIONS as any)}
                    testID="manage-integrations-button"
                  >
                    <Text>Manage Third-Party Integrations</Text>
                  </Button>
                </View>
              </CardContent>
            </Card>

            <SettingsGroup title="About" testID="about-section">
              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-muted-foreground">Version</Text>
                  <Text className="text-sm font-medium">1.0.0</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-muted-foreground">Build</Text>
                  <Text className="text-sm font-medium">12345</Text>
                </View>
              </View>
            </SettingsGroup>

            {typeof __DEV__ !== "undefined" && __DEV__ && (
              <SettingsGroup title="Debug" testID="debug-section">
                <View className="gap-1">
                  <Text className="text-muted-foreground text-xs">
                    User ID: {user?.id || "None"}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    Email: {user?.email || "None"}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    Profile ID: {profile?.id || "None"}
                  </Text>
                </View>
              </SettingsGroup>
            )}
          </>
        ) : null}
      </ScrollView>
      {showSignOutConfirm ? (
        <AppConfirmModal
          description="Are you sure you want to sign out?"
          onClose={() => setShowSignOutConfirm(false)}
          primaryAction={{
            label: isSigningOut ? "Signing out..." : "Sign Out",
            onPress: () => {
              void confirmSignOut();
            },
            variant: "destructive",
            disabled: isSigningOut,
            testID: "user-detail-signout-confirm",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowSignOutConfirm(false),
            variant: "outline",
          }}
          testID="user-detail-signout-modal"
          title="Sign Out"
        />
      ) : null}
      {showDeleteAccountConfirm ? (
        <AppConfirmModal
          description="Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost."
          onClose={() => setShowDeleteAccountConfirm(false)}
          primaryAction={{
            label: "Delete",
            onPress: () => {
              setShowDeleteAccountConfirm(false);
              setShowDeleteAccountFinalConfirm(true);
            },
            variant: "destructive",
            testID: "user-detail-delete-account-confirm",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteAccountConfirm(false),
            variant: "outline",
          }}
          testID="user-detail-delete-account-modal"
          title="Delete Account"
        />
      ) : null}
      {showDeleteAccountFinalConfirm ? (
        <AppConfirmModal
          description="This is your last chance. Are you absolutely sure you want to delete your account?"
          onClose={() => setShowDeleteAccountFinalConfirm(false)}
          primaryAction={{
            label: "Yes, Delete My Account",
            onPress: () => {
              void confirmDeleteAccount();
            },
            variant: "destructive",
            testID: "user-detail-delete-account-final-confirm",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteAccountFinalConfirm(false),
            variant: "outline",
          }}
          testID="user-detail-delete-account-final-modal"
          title="Final Confirmation"
        />
      ) : null}
      {statusModal ? (
        <AppConfirmModal
          description={statusModal.description}
          onClose={() => {
            const next = statusModal.onClose;
            setStatusModal(null);
            next?.();
          }}
          primaryAction={{
            label: "OK",
            onPress: () => {
              const next = statusModal.onClose;
              setStatusModal(null);
              next?.();
            },
            testID: "user-detail-status-confirm",
          }}
          testID="user-detail-status-modal"
          title={statusModal.title}
        />
      ) : null}
    </>
  );
}

export default function UserDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <UserDetailScreen />
    </ErrorBoundary>
  );
}

function QuickLinkTile({
  title,
  description,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="min-w-[47%] flex-1 rounded-2xl border border-border bg-muted/20 p-4"
      testID={testID}
    >
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-xs text-muted-foreground">{description}</Text>
    </TouchableOpacity>
  );
}

function TouchableProfileStat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-1 rounded-xl border border-border bg-muted/20 px-4 py-3"
    >
      <Text className="text-base font-semibold text-foreground">{value}</Text>
      <Text className="text-xs font-medium text-primary">{label}</Text>
    </TouchableOpacity>
  );
}
