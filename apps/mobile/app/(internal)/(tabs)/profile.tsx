import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { SettingItem, SettingsGroup } from "@repo/ui/components/settings-group";
import { Text } from "@repo/ui/components/text";
import React, { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { TrendsInsightsSurface } from "./trends";

const contentLinks = [
  {
    label: "Goals",
    description: "Target races, milestones, and performance objectives.",
    buttonLabel: "Open",
    route: ROUTES.GOALS.LIST,
    testID: "profile-tab-goals",
  },
  {
    label: "Activities",
    description: "Completed activity history and imported sessions.",
    buttonLabel: "Open",
    route: ROUTES.ACTIVITIES.LIST,
    testID: "profile-tab-activities",
  },
  {
    label: "Activity Plans",
    description: "Reusable workouts, routes, and planned session templates.",
    buttonLabel: "Open",
    route: ROUTES.PLAN.ACTIVITY_PLAN_LIST,
    testID: "profile-tab-activity-plans",
  },
  {
    label: "Training Plans",
    description: "Structured programs and scheduled plan templates.",
    buttonLabel: "Open",
    route: ROUTES.PLAN.TRAINING_PLAN.LIST,
    testID: "profile-tab-training-plans",
  },
  {
    label: "Routes",
    description: "Saved course library and GPS route uploads.",
    buttonLabel: "Open",
    route: ROUTES.ROUTES.LIST,
    testID: "profile-tab-routes",
  },
] as const;

export default function ProfileTabScreen() {
  const navigateTo = useAppNavigate();
  const {
    user,
    profile,
    updateEmail,
    updatePassword,
    deleteAccount,
    canUpdateEmail,
    updateEmailUnavailableReason,
  } = useAuth();
  const authStore = useAuthStore();
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [passwordFormVisible, setPasswordFormVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarUri = profile?.avatar_url;
  const fallback =
    profile?.username?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "A";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          void authStore.clearSession();
        },
      },
    ]);
  };

  const handleUpdateEmail = () => {
    const email = newEmail.trim();
    if (!email) {
      Alert.alert("Error", "Please enter a new email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    void updateEmail({ newEmail: email })
      .then(() => {
        Alert.alert(
          "Verification Sent",
          `We sent email change instructions for ${email}. Follow the link in your inbox to complete the update.`,
        );
        setEmailFormVisible(false);
        setNewEmail("");
      })
      .catch((error: unknown) => {
        Alert.alert("Error", error instanceof Error ? error.message : "Failed to update email");
      });
  };

  const handleUpdatePassword = () => {
    if (!currentPassword.trim()) {
      Alert.alert("Error", "Please enter your current password");
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
        setPasswordFormVisible(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((error: unknown) => {
        Alert.alert("Error", error instanceof Error ? error.message : "Failed to update password");
      });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteAccount().catch((error: unknown) => {
              Alert.alert(
                "Error",
                error instanceof Error ? error.message : "Failed to delete account",
              );
            });
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-background" testID="profile-tab-screen">
      <AppHeader title="Profile" />
      <ScrollView contentContainerClassName="gap-6 p-6 pb-10" showsVerticalScrollIndicator={false}>
        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-5 p-6">
            <View className="flex-row items-center gap-4">
              <Avatar alt={profile?.username || "User profile"} className="h-20 w-20">
                {avatarUri ? <AvatarImage source={{ uri: avatarUri }} key={avatarUri} /> : null}
                <AvatarFallback>
                  <Text className="text-2xl font-semibold text-foreground">{fallback}</Text>
                </AvatarFallback>
              </Avatar>

              <View className="flex-1 gap-1">
                <Text className="text-2xl font-semibold text-foreground">
                  {profile?.username || user?.email?.split("@")[0] || "Athlete"}
                </Text>
                {user?.email ? (
                  <Text className="text-sm text-muted-foreground">{user.email}</Text>
                ) : null}
                <Text className="text-xs font-medium text-muted-foreground">
                  {profile?.is_public ? "Public profile" : "Private profile"}
                </Text>
              </View>
            </View>

            <Button
              variant="outline"
              onPress={() => navigateTo(ROUTES.PROFILE_EDIT as any)}
              testID="profile-tab-edit-profile"
            >
              <Text>Edit Profile</Text>
            </Button>
          </CardContent>
        </Card>

        <TrendsInsightsSurface embedded />

        <SettingsGroup
          title="Metric Entries"
          description="Manage the raw entries behind the visual trend cards."
          testID="profile-tab-metric-entries"
        >
          <SettingItem
            type="button"
            label="Profile Metrics Log"
            description="Review, add, or edit body and performance metric entries."
            buttonLabel="Manage"
            variant="outline"
            onPress={() => navigateTo(ROUTES.PROFILE_METRICS.LIST as any)}
            testID="profile-tab-profile-metrics"
          />
        </SettingsGroup>

        <SettingsGroup
          title="Training Library"
          description="Open saved plans, routes, sessions, and completed activity history."
          testID="profile-tab-library"
        >
          {contentLinks.map((link) => (
            <SettingItem
              key={link.testID}
              type="button"
              label={link.label}
              description={link.description}
              buttonLabel={link.buttonLabel}
              variant="outline"
              onPress={() => navigateTo(link.route as any)}
              testID={link.testID}
            />
          ))}
          <SettingItem
            type="button"
            label="Scheduled Activities"
            description="Review upcoming planned sessions and calendar-linked workouts."
            buttonLabel="Open"
            variant="outline"
            onPress={() => navigateTo(ROUTES.PLAN.SCHEDULED as any)}
            testID="profile-tab-scheduled-activities"
          />
        </SettingsGroup>

        <SettingsGroup
          title="Settings"
          description="Manage training preferences, integrations, and account access."
          testID="profile-tab-settings"
        >
          <SettingItem
            type="button"
            label="Training Preferences"
            description="Adjust the preferences used for planning and recommendations."
            buttonLabel="Open"
            variant="outline"
            onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PREFERENCES as any)}
            testID="profile-tab-training-preferences"
          />
          <SettingItem
            type="button"
            label="Integrations"
            description="Connect third-party services like Strava and Garmin."
            buttonLabel="Manage"
            variant="outline"
            onPress={() => navigateTo(ROUTES.INTEGRATIONS as any)}
            testID="profile-tab-integrations"
          />
          <SettingItem
            type="button"
            label="Email"
            description={user?.email || "Not set"}
            buttonLabel={canUpdateEmail ? "Change" : "Unavailable"}
            variant="outline"
            onPress={() => {
              if (canUpdateEmail) {
                setEmailFormVisible((value) => !value);
                return;
              }
              Alert.alert(
                "Temporarily unavailable",
                updateEmailUnavailableReason ?? "Email changes are currently unavailable.",
              );
            }}
            disabled={!canUpdateEmail}
            testID="profile-tab-update-email"
          />
          {emailFormVisible ? (
            <View className="mb-4 gap-3 rounded-2xl border border-border bg-card p-4">
              <Text className="text-sm font-medium text-foreground">Update Email Address</Text>
              <Input
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="New email address"
                autoCapitalize="none"
                keyboardType="email-address"
                testID="profile-tab-email-input"
              />
              <Button onPress={handleUpdateEmail} testID="profile-tab-email-submit-button">
                <Text>Send Verification Email</Text>
              </Button>
            </View>
          ) : null}
          <SettingItem
            type="button"
            label="Password"
            description="Change your password"
            buttonLabel={passwordFormVisible ? "Cancel" : "Change"}
            variant="outline"
            onPress={() => setPasswordFormVisible((value) => !value)}
            testID="profile-tab-change-password"
          />
          {passwordFormVisible ? (
            <View className="mb-4 gap-3 rounded-2xl border border-border bg-card p-4">
              <Text className="text-sm font-medium text-foreground">Change Your Password</Text>
              <Input
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current password"
                secureTextEntry
                autoCapitalize="none"
                testID="profile-tab-current-password-input"
              />
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                secureTextEntry
                autoCapitalize="none"
                testID="profile-tab-new-password-input"
              />
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                secureTextEntry
                autoCapitalize="none"
                testID="profile-tab-confirm-password-input"
              />
              <Button onPress={handleUpdatePassword} testID="profile-tab-password-submit-button">
                <Text>Update Password</Text>
              </Button>
            </View>
          ) : null}
          <SettingItem
            type="button"
            label="Sign Out"
            description="Sign out of this device."
            buttonLabel="Sign Out"
            variant="destructive"
            onPress={handleSignOut}
            testID="profile-tab-sign-out"
          />
          <SettingItem
            type="button"
            label="Delete Account"
            description="Permanently delete your account and all data."
            buttonLabel="Delete"
            variant="destructive"
            onPress={handleDeleteAccount}
            testID="profile-tab-delete-account"
          />
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}
