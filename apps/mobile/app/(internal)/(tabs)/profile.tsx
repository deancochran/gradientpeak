import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { SettingItem, SettingsGroup } from "@repo/ui/components/settings-group";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { Alert, ScrollView, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function ProfileTabScreen() {
  const navigateTo = useAppNavigate();
  const { user, profile } = useAuth();
  const authStore = useAuthStore();
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

        <SettingsGroup
          title="Settings"
          description="Manage profile, training, integrations, and account access."
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
            label="Profile Metrics"
            description="Review stored body and performance metrics."
            buttonLabel="View"
            variant="outline"
            onPress={() => navigateTo(ROUTES.PROFILE_METRICS.LIST as any)}
            testID="profile-tab-profile-metrics"
          />
          <SettingItem
            type="button"
            label="Sign Out"
            description="Sign out of this device."
            buttonLabel="Sign Out"
            variant="destructive"
            onPress={handleSignOut}
            testID="profile-tab-sign-out"
          />
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}
