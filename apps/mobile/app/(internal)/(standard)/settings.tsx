import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  SettingItem,
  SettingItemSeparator,
  SettingsGroup,
  TrainingZonesSection,
} from "@/components/settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/stores/theme-store";
import { supabase } from "@/lib/supabase/client";
import { Edit3 } from "lucide-react-native";

function SettingsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [signoutLoading, setSignoutLoading] = useState(false);

  const handleSignOut = async () => {
    setSignoutLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setSignoutLoading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      showsVerticalScrollIndicator={false}
      testID="settings-screen"
    >
      {/* Profile Header */}
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
          {(profile?.bio ||
            profile?.dob ||
            profile?.weight_kg ||
            profile?.ftp ||
            profile?.threshold_hr) && (
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
                {profile.dob && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Age
                    </Text>
                    <Text className="text-sm font-medium">
                      {new Date().getFullYear() -
                        new Date(profile.dob).getFullYear()}{" "}
                      years
                    </Text>
                  </View>
                )}

                {profile.weight_kg && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Weight
                    </Text>
                    <Text className="text-sm font-medium">
                      {profile.weight_kg} kg
                    </Text>
                  </View>
                )}

                {profile.ftp && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      FTP
                    </Text>
                    <Text className="text-sm font-medium">
                      {profile.ftp} watts
                    </Text>
                  </View>
                )}

                {profile.threshold_hr && (
                  <View className="flex-1 min-w-[45%]">
                    <Text className="text-xs text-muted-foreground uppercase mb-1">
                      Threshold HR
                    </Text>
                    <Text className="text-sm font-medium">
                      {profile.threshold_hr} bpm
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
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Training Zones */}
      <TrainingZonesSection
        profile={profile}
        onUpdateZones={() => {
          router.push("/profile-edit" as any);
        }}
      />

      {/* Integrations */}
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

      {/* Preferences */}
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

        <SettingItemSeparator />

        <SettingItem
          type="toggle"
          label="Notifications"
          description="Receive activity reminders and updates"
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          testID="notifications"
        />

        <SettingItemSeparator />

        <SettingItem
          type="toggle"
          label="Auto Sync"
          description="Automatically sync activities when online"
          value={true}
          onValueChange={() => {}}
          disabled
          testID="auto-sync"
        />
      </SettingsGroup>

      {/* Account */}
      <SettingsGroup
        title="Account"
        description="Manage your account and data"
        testID="account-section"
      >
        <SettingItem
          type="button"
          label="Change Password"
          buttonLabel="Update"
          variant="outline"
          onPress={() => console.log("Change password - not implemented yet")}
          testID="change-password"
        />

        <SettingItemSeparator />

        <SettingItem
          type="button"
          label="Export My Data"
          description="Download all your activity data"
          buttonLabel="Export"
          variant="outline"
          onPress={() => console.log("Export data - not implemented yet")}
          testID="export-data"
        />

        <SettingItemSeparator />

        <SettingItem
          type="button"
          label="Sign Out"
          buttonLabel={signoutLoading ? "Signing out..." : "Sign Out"}
          variant="destructive"
          onPress={handleSignOut}
          disabled={signoutLoading}
          testID="sign-out"
        />
      </SettingsGroup>

      {/* About */}
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

        <SettingItemSeparator />

        <SettingItem
          type="link"
          label="Licenses"
          linkLabel="View"
          onPress={() => console.log("View licenses - not implemented yet")}
          testID="licenses"
        />
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
