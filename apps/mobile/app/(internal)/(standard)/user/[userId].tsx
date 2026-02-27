import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { SettingItem, SettingsGroup } from "@/components/settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Edit3 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) return null;

  const today = new Date();
  let years = today.getFullYear() - dobDate.getFullYear();
  const monthDelta = today.getMonth() - dobDate.getMonth();
  const hasBirthdayPassed =
    monthDelta > 0 ||
    (monthDelta === 0 && today.getDate() >= dobDate.getDate());
  if (!hasBirthdayPassed) years -= 1;
  return years;
}

function UserDetailScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user, profile } = useAuth();
  const authStore = useAuthStore();
  const { theme, setTheme } = useTheme();
  const utils = trpc.useUtils();

  const targetUserId = typeof userId === "string" ? userId : "";
  const isOwnProfile = !!user?.id && user?.id === targetUserId;

  const {
    data: targetProfile,
    isLoading,
    error,
  } = trpc.profiles.getPublicById.useQuery(
    { id: targetUserId },
    { enabled: targetUserId.length > 0 },
  );

  const renderedProfile = useMemo(() => {
    if (isOwnProfile && profile) {
      return profile;
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

  const signOutMutation = trpc.auth.signOut.useMutation({
    onSuccess: async () => {
      await authStore.clearSession();
      utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);
    },
    onError: (mutationError) => {
      Alert.alert("Error", mutationError.message || "Failed to sign out");
    },
  });

  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      await authStore.clearSession();
      utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);

      setTimeout(() => {
        Alert.alert(
          "Account Deleted",
          "Your account has been successfully deleted.",
        );
      }, 500);
    },
    onError: (mutationError) => {
      Alert.alert(
        "Error",
        mutationError.message ||
          "Failed to delete account. Please contact support.",
      );
    },
  });

  const updateEmailMutation = trpc.auth.updateEmail.useMutation({
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

  const updatePasswordMutation = trpc.auth.updatePassword.useMutation({
    onSuccess: () => {
      Alert.alert(
        "Password Updated",
        "Your password has been successfully changed.",
      );
      setIsPasswordChangeVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (mutationError) => {
      Alert.alert(
        "Error",
        mutationError.message || "Failed to update password",
      );
    },
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
      Alert.alert(
        "Error",
        "New password must be different from current password",
      );
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
        <Text className="text-sm text-muted-foreground">
          Loading profile...
        </Text>
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
          <Text className="mt-2 text-sm text-muted-foreground">
            Please try again.
          </Text>
        )}
      </View>
    );
  }

  if (!renderedProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">
          Profile unavailable.
        </Text>
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
            <Avatar
              alt={renderedProfile?.username || "User"}
              className="w-24 h-24 mb-4"
            >
              {renderedProfile?.avatar_url ? (
                <AvatarImage
                  source={{ uri: renderedProfile.avatar_url }}
                  key={renderedProfile.avatar_url}
                />
              ) : null}
              <AvatarFallback>
                <Text className="text-3xl">
                  {renderedProfile?.username?.charAt(0)?.toUpperCase() ||
                    (isOwnProfile
                      ? user?.email?.charAt(0)?.toUpperCase()
                      : null) ||
                    "U"}
                </Text>
              </AvatarFallback>
            </Avatar>

            <Text className="text-2xl font-bold mb-1">
              {renderedProfile?.username || "Unknown user"}
            </Text>
            {isOwnProfile && user?.email ? (
              <Text className="text-sm text-muted-foreground mb-4">
                {user.email}
              </Text>
            ) : null}

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
            ) : null}
          </View>

          {hasProfileMetadata && (
            <View className="gap-3 pt-4 border-t border-border">
              {renderedProfile.bio && (
                <View>
                  <Text className="text-xs text-muted-foreground uppercase mb-1">
                    Bio
                  </Text>
                  <Text className="text-sm">{renderedProfile.bio}</Text>
                </View>
              )}

              <View className="flex-row flex-wrap gap-4">
                {age !== null && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Age
                    </Text>
                    <Text className="text-sm font-medium">{age} years</Text>
                  </View>
                )}

                {renderedProfile.gender && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Gender
                    </Text>
                    <Text className="text-sm font-medium capitalize">
                      {renderedProfile.gender}
                    </Text>
                  </View>
                )}

                {renderedProfile.preferred_units && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Units
                    </Text>
                    <Text className="text-sm font-medium capitalize">
                      {renderedProfile.preferred_units}
                    </Text>
                  </View>
                )}

                {renderedProfile.language && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Language
                    </Text>
                    <Text className="text-sm font-medium uppercase">
                      {renderedProfile.language}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {isOwnProfile ? (
        <>
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
                <Text className="text-sm font-medium mb-3">
                  Update Email Address
                </Text>
                <Text className="text-xs text-muted-foreground mb-3">
                  You&apos;ll need to verify both your current and new email
                  addresses to complete this change.
                </Text>
                <Input
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="New email address"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="mb-3"
                />
                <Input
                  value={emailPassword}
                  onChangeText={setEmailPassword}
                  placeholder="Enter your password to confirm"
                  secureTextEntry
                  autoCapitalize="none"
                  className="mb-3"
                />
                <Button
                  onPress={handleUpdateEmail}
                  disabled={updateEmailMutation.isPending}
                >
                  <Text>
                    {updateEmailMutation.isPending
                      ? "Sending..."
                      : "Send Verification Emails"}
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
              onPress={() =>
                setIsPasswordChangeVisible(!isPasswordChangeVisible)
              }
              testID="change-password"
            />

            {isPasswordChangeVisible && (
              <View className="bg-card p-4 rounded-lg border border-border mb-4">
                <Text className="text-sm font-medium mb-3">
                  Change Your Password
                </Text>
                <Input
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  secureTextEntry
                  autoCapitalize="none"
                  className="mb-3"
                />
                <Input
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password (min 6 characters)"
                  secureTextEntry
                  autoCapitalize="none"
                  className="mb-3"
                />
                <Input
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  secureTextEntry
                  autoCapitalize="none"
                  className="mb-3"
                />
                <Button
                  onPress={handleUpdatePassword}
                  disabled={updatePasswordMutation.isPending}
                >
                  <Text>
                    {updatePasswordMutation.isPending
                      ? "Updating..."
                      : "Update Password"}
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
              onValueChange={(isChecked) =>
                setTheme(isChecked ? "dark" : "light")
              }
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
              buttonLabel={
                signOutMutation.isPending ? "Signing out..." : "Sign Out"
              }
              variant="destructive"
              onPress={handleSignOut}
              disabled={signOutMutation.isPending}
              testID="sign-out"
            />

            <SettingItem
              type="button"
              label="Delete Account"
              description="Permanently delete your account and all data"
              buttonLabel={
                deleteAccountMutation.isPending ? "Deleting..." : "Delete"
              }
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
  );
}

export default function UserDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <UserDetailScreen />
    </ErrorBoundary>
  );
}
