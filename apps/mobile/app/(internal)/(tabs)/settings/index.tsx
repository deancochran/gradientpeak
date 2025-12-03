import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  ProfileSection,
  SettingItem,
  SettingItemSeparator,
  SettingsGroup,
  TrainingZonesSection,
} from "@/components/settings";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/stores/theme-store";
import { supabase } from "@/lib/supabase/client";

function SettingsScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
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
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <Text variant="h2" className="text-foreground">
          Settings
        </Text>
      </View>

      {/* Profile Section */}
      <ProfileSection
        profile={profile}
        onRefreshProfile={() => refreshProfile().then(() => {})}
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
          onPress={() =>
            router.push("/(internal)/(tabs)/settings/integrations" as any)
          }
          testID="integrations"
        />
      </SettingsGroup>

      {/* Training Zones */}
      <TrainingZonesSection
        profile={profile}
        onUpdateZones={() => {
          // Scroll to profile section would go here if needed
          console.log("Scroll to profile for zone configuration");
        }}
      />

      {/* App Settings */}
      <SettingsGroup
        title="App Settings"
        description="Customize your app experience"
        testID="app-settings-section"
      >
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
          label="Dark Mode"
          description="Switch between light and dark themes"
          value={theme === "dark"}
          onValueChange={(isChecked) => setTheme(isChecked ? "dark" : "light")}
          testID="dark-mode"
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

      {/* Account Actions */}
      <SettingsGroup
        title="Account Actions"
        description="Manage your account settings"
        testID="account-actions-section"
      >
        <Button
          variant="outline"
          onPress={() => console.log("Change password - not implemented yet")}
          testID="change-password-button"
        >
          <Text>Change Password</Text>
        </Button>

        <Button
          variant="outline"
          onPress={() => console.log("Export data")}
          testID="export-data-button"
        >
          <Text>Export My Data</Text>
        </Button>

        <SettingItemSeparator />

        <Button
          testID="sign-out-button"
          onPress={handleSignOut}
          disabled={signoutLoading}
        >
          <Text>{signoutLoading ? "Signing out..." : "Sign out"}</Text>
        </Button>
      </SettingsGroup>

      {/* App Information */}
      <SettingsGroup title="App Information" testID="app-info-section">
        <Text className="text-muted-foreground">Version 1.0.0</Text>
        <Text className="text-muted-foreground">Build 12345</Text>
        <SettingItem
          type="link"
          label="Licenses"
          linkLabel="View Licenses"
          onPress={() => console.log("View licenses")}
          testID="licenses"
        />
      </SettingsGroup>

      {/* Permissions Management */}
      <SettingsGroup
        title="Permissions Management"
        testID="permissions-section"
      >
        <SettingItem
          type="link"
          label="Permissions"
          linkLabel="Manage Permissions"
          onPress={() =>
            router.push("/(internal)/(tabs)/settings/permissions" as any)
          }
          testID="permissions"
        />
      </SettingsGroup>

      {/* Debug Info (Development only) */}
      {__DEV__ && (
        <SettingsGroup title="Debug Information" testID="debug-info-section">
          <Text className="text-muted-foreground text-xs">
            User ID: {user?.id || "None"}
          </Text>
          <Text className="text-muted-foreground text-xs">
            Email: {user?.email || "None"}
          </Text>
          <Text className="text-muted-foreground text-xs">
            Profile ID: {profile?.id || "None"}
          </Text>
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
