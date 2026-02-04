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
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/stores/theme-store";
import { supabase } from "@/lib/supabase/client";
import { Edit3 } from "lucide-react-native";

function SettingsScreen() {
  const router = useRouter();
  const { user, profile, deleteAccount } = useAuth();
  const { theme, setTheme } = useTheme();
  const [signoutLoading, setSignoutLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isEmailUpdateVisible, setIsEmailUpdateVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailUpdateLoading, setEmailUpdateLoading] = useState(false);

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

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and all your data will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleteLoading(true);
            try {
              await deleteAccount();
              // Auth provider handles sign out and state clearing
              // Router will redirect to sign-in automatically via global guard
            } catch (error) {
              Alert.alert(
                "Error",
                "Failed to delete account. Please try again.",
              );
              setDeleteLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleUpdateEmail = async () => {
    if (!newEmail) return;
    setEmailUpdateLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      Alert.alert(
        "Verification Sent",
        `Please check ${newEmail} to verify your new email address.`,
      );
      setIsEmailUpdateVisible(false);
      setNewEmail("");
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to update email",
      );
    } finally {
      setEmailUpdateLoading(false);
    }
  };

  const hasFTP = !!profile?.ftp;
  const hasThresholdHR = !!profile?.threshold_hr;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      showsVerticalScrollIndicator={false}
      testID="settings-screen"
    >
      {/* Profile Header with Training Zones */}
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
            profile?.threshold_hr ||
            profile?.preferred_units) && (
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

          {/* Training Zones */}
          {(hasFTP || hasThresholdHR) && (
            <>
              <Separator className="my-4 bg-border" />
              <View className="gap-4">
                <Text className="text-sm font-semibold">Training Zones</Text>

                {/* Power Zones */}
                {hasFTP && (
                  <View className="gap-2">
                    <Text className="text-xs text-muted-foreground uppercase">
                      Power Zones (FTP: {profile.ftp}W)
                    </Text>
                    <View className="gap-1.5">
                      <ZoneRow
                        label="Recovery"
                        range={`${Math.round(profile.ftp! * 0.55)}-${Math.round(profile.ftp! * 0.75)}W`}
                      />
                      <ZoneRow
                        label="Tempo"
                        range={`${Math.round(profile.ftp! * 0.75)}-${Math.round(profile.ftp! * 0.9)}W`}
                      />
                      <ZoneRow
                        label="Threshold"
                        range={`${Math.round(profile.ftp! * 0.9)}-${Math.round(profile.ftp! * 1.05)}W`}
                      />
                      <ZoneRow
                        label="VO2 Max"
                        range={`${Math.round(profile.ftp! * 1.05)}-${Math.round(profile.ftp! * 1.2)}W`}
                      />
                      <ZoneRow
                        label="Anaerobic"
                        range={`${Math.round(profile.ftp! * 1.2)}+W`}
                      />
                    </View>
                  </View>
                )}

                {/* Heart Rate Zones */}
                {hasThresholdHR && (
                  <View className="gap-2">
                    <Text className="text-xs text-muted-foreground uppercase">
                      Heart Rate Zones (Threshold: {profile.threshold_hr} bpm)
                    </Text>
                    <View className="gap-1.5">
                      <ZoneRow
                        label="Recovery"
                        range={`${Math.round(profile.threshold_hr! * 0.68)}-${Math.round(profile.threshold_hr! * 0.83)} bpm`}
                      />
                      <ZoneRow
                        label="Tempo"
                        range={`${Math.round(profile.threshold_hr! * 0.83)}-${Math.round(profile.threshold_hr! * 0.94)} bpm`}
                      />
                      <ZoneRow
                        label="Threshold"
                        range={`${Math.round(profile.threshold_hr! * 0.94)}-${Math.round(profile.threshold_hr! * 1.05)} bpm`}
                      />
                      <ZoneRow
                        label="VO2 Max"
                        range={`${Math.round(profile.threshold_hr! * 1.05)}+ bpm`}
                      />
                    </View>
                  </View>
                )}
              </View>
            </>
          )}
        </CardContent>
      </Card>

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
      </SettingsGroup>

      {/* Security */}
      <SettingsGroup
        title="Security"
        description="Manage your login details"
        testID="security-section"
      >
        <SettingItem
          type="button"
          label="Update Email"
          buttonLabel={isEmailUpdateVisible ? "Cancel" : "Update"}
          variant="outline"
          onPress={() => setIsEmailUpdateVisible(!isEmailUpdateVisible)}
        />

        {isEmailUpdateVisible && (
          <View className="bg-card p-4 rounded-lg border border-border mb-4">
            <Text className="text-sm font-medium mb-2">New Email Address</Text>
            <Input
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="Enter new email"
              autoCapitalize="none"
              keyboardType="email-address"
              className="mb-3"
            />
            <Button onPress={handleUpdateEmail} disabled={emailUpdateLoading}>
              <Text>
                {emailUpdateLoading ? "Updating..." : "Send Verification"}
              </Text>
            </Button>
          </View>
        )}

        <SettingItem
          type="button"
          label="Delete Account"
          buttonLabel={deleteLoading ? "Deleting..." : "Delete"}
          variant="destructive"
          onPress={handleDeleteAccount}
          disabled={deleteLoading}
        />
      </SettingsGroup>

      {/* Account */}
      <SettingsGroup
        title="Account"
        description="Manage your account"
        testID="account-section"
      >
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

interface ZoneRowProps {
  label: string;
  range: string;
}

function ZoneRow({ label, range }: ZoneRowProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      <Text className="text-foreground text-xs font-medium">{range}</Text>
    </View>
  );
}

export default function SettingsScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SettingsScreen />
    </ErrorBoundary>
  );
}
