import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

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
import { Edit3 } from "lucide-react-native";

function SettingsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const authStore = useAuthStore();
  const utils = trpc.useUtils();

  // Email update state
  const [isEmailUpdateVisible, setIsEmailUpdateVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  // Password change state
  const [isPasswordChangeVisible, setIsPasswordChangeVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ============================================================
  // MUTATIONS
  // ============================================================

  const signOutMutation = trpc.auth.signOut.useMutation({
    onSuccess: async () => {
      // Clear local session and navigate
      await authStore.clearSession();
      utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to sign out");
    },
  });

  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      // Clear local session and navigate
      await authStore.clearSession();
      utils.profiles.invalidate();
      router.replace("/(external)/sign-in" as any);

      // Show success after a brief delay to ensure navigation completes
      setTimeout(() => {
        Alert.alert(
          "Account Deleted",
          "Your account has been successfully deleted.",
        );
      }, 500);
    },
    onError: (error) => {
      Alert.alert(
        "Error",
        error.message || "Failed to delete account. Please contact support.",
      );
    },
  });

  const updateEmailMutation = trpc.auth.updateEmail.useMutation({
    onSuccess: (data) => {
      Alert.alert("Verification Sent", data.message);
      setIsEmailUpdateVisible(false);
      setNewEmail("");
      setEmailPassword("");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to update email");
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
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to update password");
    },
  });

  // ============================================================
  // HANDLERS
  // ============================================================

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
            // Second confirmation for extra safety
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

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const dobDate = profile?.dob ? new Date(profile.dob) : null;
  const hasValidDob = !!dobDate && !Number.isNaN(dobDate.getTime());
  const age = hasValidDob
    ? (() => {
        const today = new Date();
        let years = today.getFullYear() - dobDate.getFullYear();
        const monthDelta = today.getMonth() - dobDate.getMonth();
        const hasBirthdayPassed =
          monthDelta > 0 ||
          (monthDelta === 0 && today.getDate() >= dobDate.getDate());
        if (!hasBirthdayPassed) years -= 1;
        return years;
      })()
    : null;

  const hasProfileMetadata =
    !!profile?.bio ||
    age !== null ||
    !!profile?.gender ||
    !!profile?.preferred_units ||
    !!profile?.language;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      showsVerticalScrollIndicator={false}
      testID="settings-screen"
    >
      {/* ============================================================ */}
      {/* PROFILE SECTION */}
      {/* ============================================================ */}
      <Card>
        <CardContent className="p-6">
          <View className="items-center mb-4">
            <Avatar
              alt={profile?.username || "User"}
              className="w-24 h-24 mb-4"
            >
              {profile?.avatar_url ? (
                <AvatarImage
                  source={{ uri: profile.avatar_url }}
                  key={profile.avatar_url}
                />
              ) : null}
              <AvatarFallback>
                <Text className="text-3xl">
                  {profile?.username?.charAt(0)?.toUpperCase() ||
                    user?.email?.charAt(0)?.toUpperCase() ||
                    "U"}
                </Text>
              </AvatarFallback>
            </Avatar>

            <Text className="text-2xl font-bold mb-1">
              {profile?.username || "Set username"}
            </Text>
            <Text className="text-sm text-muted-foreground mb-4">
              {user?.email}
            </Text>

            <Button
              variant="outline"
              size="sm"
              onPress={() => router.push("/profile-edit" as any)}
              className="flex-row gap-2"
            >
              <Icon as={Edit3} size={16} />
              <Text>Edit Profile</Text>
            </Button>
          </View>

          {/* Profile Metadata */}
          {hasProfileMetadata && (
            <View className="gap-3 pt-4 border-t border-border">
              {profile.bio && (
                <View>
                  <Text className="text-xs text-muted-foreground uppercase mb-1">
                    Bio
                  </Text>
                  <Text className="text-sm">{profile.bio}</Text>
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

                {profile.gender && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Gender
                    </Text>
                    <Text className="text-sm font-medium capitalize">
                      {profile.gender}
                    </Text>
                  </View>
                )}

                {profile.preferred_units && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Units
                    </Text>
                    <Text className="text-sm font-medium capitalize">
                      {profile.preferred_units}
                    </Text>
                  </View>
                )}

                {profile.language && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Language
                    </Text>
                    <Text className="text-sm font-medium uppercase">
                      {profile.language}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* ACCOUNT SECTION */}
      {/* ============================================================ */}
      <SettingsGroup
        title="Account"
        description="Manage your account settings"
        testID="account-section"
      >
        {/* Email */}
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
              You'll need to verify both your current and new email addresses to
              complete this change.
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

        {/* Password */}
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

      {/* ============================================================ */}
      {/* INTEGRATIONS SECTION */}
      {/* ============================================================ */}
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

      {/* ============================================================ */}
      {/* PREFERENCES SECTION */}
      {/* ============================================================ */}
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

      {/* ============================================================ */}
      {/* DANGER ZONE SECTION */}
      {/* ============================================================ */}
      <SettingsGroup
        title="Danger Zone"
        description="Irreversible actions"
        testID="danger-section"
      >
        {/* Sign Out */}
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

        {/* Delete Account */}
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

      {/* ============================================================ */}
      {/* ABOUT SECTION */}
      {/* ============================================================ */}
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

      {/* Debug Info (Development only) */}
      {__DEV__ && (
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
    </ScrollView>
  );
}

export default function SettingsScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SettingsScreen />
    </ErrorBoundary>
  );
}
