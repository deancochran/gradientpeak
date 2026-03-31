import { invalidateRelationshipQueries } from "@repo/api/react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { SettingItem, SettingsGroup } from "@repo/ui/components/settings-group";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Clock, Edit3, MessageCircle, UserMinus, UserPlus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";
import { api } from "@/lib/api";

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
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user, profile } = useAuth();
  const authStore = useAuthStore();
  const { theme, setTheme } = useTheme();
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
  const [emailPassword, setEmailPassword] = useState("");
  const [isPasswordChangeVisible, setIsPasswordChangeVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const signOutMutation = api.auth.signOut.useMutation({
    onSuccess: async () => {
      await authStore.clearSession();
      utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);
    },
    onError: (mutationError) => {
      Alert.alert("Error", mutationError.message || "Failed to sign out");
    },
  });

  const deleteAccountMutation = api.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      await authStore.clearSession();
      utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);

      setTimeout(() => {
        Alert.alert("Account Deleted", "Your account has been successfully deleted.");
      }, 500);
    },
    onError: (mutationError) => {
      Alert.alert(
        "Error",
        mutationError.message || "Failed to delete account. Please contact support.",
      );
    },
  });

  const updateEmailMutation = api.auth.updateEmail.useMutation({
    onSuccess: (data) => {
      void utils.auth.getUser.invalidate();
      Alert.alert("Verification Sent", data.message);
      setIsEmailUpdateVisible(false);
      setNewEmail("");
      setEmailPassword("");
    },
    onError: (mutationError) => {
      Alert.alert("Error", mutationError.message || "Failed to update email");
    },
  });

  const updatePasswordMutation = api.auth.updatePassword.useMutation({
    onSuccess: () => {
      Alert.alert("Password Updated", "Your password has been successfully changed.");
      setIsPasswordChangeVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (mutationError) => {
      Alert.alert("Error", mutationError.message || "Failed to update password");
    },
  });

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
        router.push(`/messages/${(data as any).id}` as any);
      }
    },
    onError: (err) => Alert.alert("Error", err.message || "Failed to start message"),
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => signOutMutation.mutate(),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This is your last chance. Are you absolutely sure you want to delete your account?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: () => deleteAccountMutation.mutate(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleUpdateEmail = () => {
    if (!newEmail.trim()) {
      Alert.alert("Error", "Please enter a new email address");
      return;
    }
    if (!emailPassword.trim()) {
      Alert.alert("Error", "Please enter your password to confirm");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    updateEmailMutation.mutate({ newEmail, password: emailPassword });
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

    updatePasswordMutation.mutate({ currentPassword, newPassword });
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

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      showsVerticalScrollIndicator={false}
      testID="user-detail-screen"
    >
      <Card>
        <CardContent className="p-6">
          <View className="items-center mb-4">
            <Avatar alt={renderedProfile?.username || "User"} className="w-24 h-24 mb-4">
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

            <Text className="text-2xl font-bold mb-1">
              {renderedProfile?.username || "Unknown user"}
            </Text>
            {isOwnProfile && user?.email ? (
              <Text className="text-sm text-muted-foreground mb-4">{user.email}</Text>
            ) : null}

            <View className="mb-4 flex-row flex-wrap items-center justify-center gap-2">
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

            <Text className="text-sm text-center text-muted-foreground mb-4">
              {isOwnProfile
                ? "Your public profile summary lives here. Account tools stay below so profile details remain easy to scan."
                : renderedProfile?.is_public
                  ? "Open profile details, then follow or message if this looks like the right connection."
                  : "This profile stays private until your follow request is accepted."}
            </Text>

            {/* Followers/Following Counts - show for ALL profiles */}
            <View className="flex-row gap-3 mb-4">
              <TouchableProfileStat
                label="Followers"
                value={renderedProfile?.followers_count ?? 0}
                onPress={() => router.push(`/followers?userId=${targetUserId}` as any)}
              />
              <TouchableProfileStat
                label="Following"
                value={renderedProfile?.following_count ?? 0}
                onPress={() => router.push(`/following?userId=${targetUserId}` as any)}
              />
            </View>

            {!isOwnProfile && renderedProfile?.follow_status === "pending" && (
              <View className="flex-row items-center gap-2 mb-3 bg-amber-100 dark:bg-amber-900 px-3 py-2 rounded-lg">
                <Icon as={Clock} size={16} className="text-amber-600 dark:text-amber-400" />
                <Text className="text-sm text-amber-700 dark:text-amber-300">
                  Follow request pending
                </Text>
              </View>
            )}

            {isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onPress={() => router.push("/profile-edit" as any)}
                className="flex-row gap-2"
                testID="edit-profile-action"
              >
                <Icon as={Edit3} size={16} />
                <Text>Edit Profile</Text>
              </Button>
            ) : (
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
            )}
          </View>

          {!isOwnProfile &&
          renderedProfile?.is_public === false &&
          renderedProfile?.follow_status !== "accepted" ? (
            <View className="items-center py-6 border-t border-border">
              <Text className="text-base font-semibold">This account is private</Text>
              <Text className="text-sm text-muted-foreground mt-1 text-center">
                Follow this account to see their activities and profile details.
              </Text>
            </View>
          ) : (
            hasProfileMetadata && (
              <View className="gap-3 pt-4 border-t border-border">
                {renderedProfile.bio && (
                  <View>
                    <Text className="text-xs text-muted-foreground uppercase mb-1">Bio</Text>
                    <Text className="text-sm">{renderedProfile.bio}</Text>
                  </View>
                )}

                <View className="flex-row flex-wrap gap-4">
                  {age !== null && (
                    <View className="flex-1 min-w-[45%]">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">Age</Text>
                      <Text className="text-sm font-medium">{age} years</Text>
                    </View>
                  )}

                  {renderedProfile.gender && (
                    <View className="flex-1 min-w-[45%]">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">Gender</Text>
                      <Text className="text-sm font-medium capitalize">
                        {renderedProfile.gender}
                      </Text>
                    </View>
                  )}

                  {renderedProfile.preferred_units && (
                    <View className="flex-1 min-w-[45%]">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">Units</Text>
                      <Text className="text-sm font-medium capitalize">
                        {renderedProfile.preferred_units}
                      </Text>
                    </View>
                  )}

                  {renderedProfile.language && (
                    <View className="flex-1 min-w-[45%]">
                      <Text className="text-xs text-muted-foreground uppercase mb-1">Language</Text>
                      <Text className="text-sm font-medium uppercase">
                        {renderedProfile.language}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )
          )}
        </CardContent>
      </Card>

      {isOwnProfile ? (
        <>
          <View className="gap-1 px-1">
            <Text className="text-lg font-semibold text-foreground">Manage your account</Text>
            <Text className="text-sm text-muted-foreground">
              Keep profile viewing simple above and use these tools when you need to manage data,
              settings, or security.
            </Text>
          </View>

          <SettingsGroup
            title="My Records"
            description="Private views for your training data"
            testID="my-records-section"
          >
            <SettingItem
              type="button"
              label="Activities"
              description="View your completed workouts"
              buttonLabel="Open"
              variant="outline"
              onPress={() => router.push(ROUTES.ACTIVITIES.LIST as any)}
              testID="my-activities"
            />
            <SettingItem
              type="button"
              label="Training Plans"
              description="Create and manage your training plans"
              buttonLabel="Open"
              variant="outline"
              onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.LIST as any)}
              testID="my-training-plans"
            />
            <SettingItem
              type="button"
              label="Activity Plans"
              description="Create or edit your plan templates"
              buttonLabel="Open"
              variant="outline"
              onPress={() => router.push(ROUTES.PLAN.CREATE_ACTIVITY_PLAN.INDEX as any)}
              testID="my-activity-plans"
            />
            <SettingItem
              type="button"
              label="Routes"
              description="Browse your uploaded routes"
              buttonLabel="Open"
              variant="outline"
              onPress={() => router.push(ROUTES.ROUTES.LIST as any)}
              testID="my-routes"
            />
            <SettingItem
              type="button"
              label="Activity Efforts"
              description="View and manage your raw capability efforts"
              buttonLabel="Open"
              variant="outline"
              onPress={() => router.push("/(internal)/(standard)/activity-efforts-list" as any)}
              testID="my-activity-efforts"
            />
          </SettingsGroup>

          <SettingsGroup
            title="Account"
            description="Manage your account settings"
            testID="account-section"
          >
            <SettingItem
              type="button"
              label="Email"
              description={user?.email || "Not set"}
              buttonLabel={isEmailUpdateVisible ? "Cancel" : "Change"}
              variant="outline"
              onPress={() => setIsEmailUpdateVisible(!isEmailUpdateVisible)}
              testID="update-email"
            />

            {isEmailUpdateVisible && (
              <View className="bg-card p-4 rounded-lg border border-border mb-4">
                <Text className="text-sm font-medium mb-3">Update Email Address</Text>
                <Text className="text-xs text-muted-foreground mb-3">
                  You&apos;ll need to verify both your current and new email addresses to complete
                  this change.
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
                <Input
                  value={emailPassword}
                  onChangeText={setEmailPassword}
                  placeholder="Enter your password to confirm"
                  secureTextEntry
                  autoCapitalize="none"
                  className="mb-3"
                  testID="account-email-password-input"
                />
                <Button
                  onPress={handleUpdateEmail}
                  disabled={updateEmailMutation.isPending}
                  testID="account-email-submit-button"
                >
                  <Text>
                    {updateEmailMutation.isPending ? "Sending..." : "Send Verification Emails"}
                  </Text>
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
                <Button
                  onPress={handleUpdatePassword}
                  disabled={updatePasswordMutation.isPending}
                  testID="account-password-submit-button"
                >
                  <Text>
                    {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
                  </Text>
                </Button>
              </View>
            )}
          </SettingsGroup>

          <SettingsGroup
            title="Integrations"
            description="Connect your fitness tracking platforms"
            testID="integrations-section"
          >
            <SettingItem
              type="button"
              label="Third-Party Services"
              description="Sync activities from Strava, Garmin, and more"
              buttonLabel="Manage"
              variant="outline"
              onPress={() => router.push("/integrations" as any)}
              testID="integrations"
            />
          </SettingsGroup>

          <SettingsGroup
            title="Preferences"
            description="Customize your app experience"
            testID="preferences-section"
          >
            <SettingItem
              type="toggle"
              label="Dark Mode"
              description="Switch between light and dark themes"
              value={theme === "dark"}
              onValueChange={(isChecked) => setTheme(isChecked ? "dark" : "light")}
              testID="dark-mode"
            />
          </SettingsGroup>

          <SettingsGroup
            title="Danger Zone"
            description="Irreversible actions"
            testID="danger-section"
          >
            <SettingItem
              type="button"
              label="Sign Out"
              description="Sign out of your account"
              buttonLabel={signOutMutation.isPending ? "Signing out..." : "Sign Out"}
              variant="destructive"
              onPress={handleSignOut}
              disabled={signOutMutation.isPending}
              testID="sign-out"
            />

            <SettingItem
              type="button"
              label="Delete Account"
              description="Permanently delete your account and all data"
              buttonLabel={deleteAccountMutation.isPending ? "Deleting..." : "Delete"}
              variant="destructive"
              onPress={handleDeleteAccount}
              disabled={deleteAccountMutation.isPending}
              testID="delete-account"
            />
          </SettingsGroup>

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
                <Text className="text-muted-foreground text-xs">User ID: {user?.id || "None"}</Text>
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
  );
}

export default function UserDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <UserDetailScreen />
    </ErrorBoundary>
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
      className="rounded-xl border border-border bg-muted/20 px-4 py-3"
    >
      <Text className="text-base font-semibold text-foreground">{value}</Text>
      <Text className="text-xs font-medium text-primary">{label}</Text>
    </TouchableOpacity>
  );
}
