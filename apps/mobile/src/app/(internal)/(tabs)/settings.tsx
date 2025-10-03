import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/stores/theme-store";
import { supabase } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc";

const profileSchema = z.object({
  username: z
    .string()
    .min(8, {
      message: "Username must be at least 8 characters.",
    })
    .optional()
    .or(z.literal("")),
  weightKg: z
    .number()
    .min(30, {
      message: "Weight must be at least 30kg.",
    })
    .max(300, {
      message: "Weight must be less than 300kg.",
    })
    .optional()
    .or(z.literal("")),
  ftp: z
    .number()
    .min(50, {
      message: "FTP must be at least 50 watts.",
    })
    .max(1000, {
      message: "FTP must be less than 1000 watts.",
    })
    .optional()
    .or(z.literal("")),
  thresholdHr: z
    .number()
    .min(100, {
      message: "Threshold HR must be at least 100 bpm.",
    })
    .max(250, {
      message: "Threshold HR must be less than 250 bpm.",
    })
    .optional()
    .or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const updateProfileMutation = trpc.profiles.update.useMutation();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: profile?.username || "",
      weightKg: profile?.weight_kg || undefined,
      ftp: profile?.ftp || undefined,
      thresholdHr: profile?.threshold_hr || undefined,
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      await updateProfileMutation.mutateAsync({
        username: data.username || undefined,
        weight_kg: data.weightKg || undefined,
        ftp: data.ftp || undefined,
        threshold_hr: data.thresholdHr || undefined,
      });

      await refreshProfile();
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  const onCancel = () => {
    form.reset();
    setIsEditing(false);
  };

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
        {!isEditing ? (
          <Button
            variant="outline"
            size="sm"
            onPress={() => setIsEditing(true)}
            testID="edit-profile-button"
          >
            <Text>Edit Profile</Text>
          </Button>
        ) : (
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={onCancel}
              testID="cancel-button"
            >
              <Text>Cancel</Text>
            </Button>
            <Button
              variant="default"
              size="sm"
              onPress={form.handleSubmit(onSubmit)}
              disabled={updateProfileMutation.isPending}
              testID="save-button"
            >
              <Text>
                {updateProfileMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Button>
          </View>
        )}
      </View>

      {/* User Profile Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-card-foreground">
            Profile Information
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Manage your personal information and training metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <Form {...form}>
            <View className="gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter username"
                        value={field.value || ""}
                        onChangeText={field.onChange}
                        editable={isEditing}
                        testID="username-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weightKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (kg)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter weight"
                        value={field.value ? field.value.toString() : ""}
                        onChangeText={(text) => {
                          const num = text ? Number(text) : undefined;
                          field.onChange(num);
                        }}
                        keyboardType="numeric"
                        editable={isEditing}
                        testID="weight-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ftp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FTP (watts)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter FTP"
                        value={field.value ? field.value.toString() : ""}
                        onChangeText={(text) => {
                          const num = text ? Number(text) : undefined;
                          field.onChange(num);
                        }}
                        keyboardType="numeric"
                        editable={isEditing}
                        testID="ftp-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="thresholdHr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Threshold HR (bpm)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter threshold HR"
                        value={field.value ? field.value.toString() : ""}
                        onChangeText={(text) => {
                          const num = text ? Number(text) : undefined;
                          field.onChange(num);
                        }}
                        keyboardType="numeric"
                        editable={isEditing}
                        testID="threshold-hr-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </View>
          </Form>
        </CardContent>
      </Card>

      {/* App Settings Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-card-foreground">App Settings</CardTitle>
          <CardDescription className="text-muted-foreground">
            Customize your app experience
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-foreground font-medium">Notifications</Text>
              <Text className="text-muted-foreground text-sm">
                Receive activity reminders and updates
              </Text>
            </View>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
              testID="notifications-switch"
            />
          </View>

          <Separator className="bg-border" />

          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-foreground font-medium">Dark Mode</Text>
              <Text className="text-muted-foreground text-sm">
                Switch between light and dark themes
              </Text>
            </View>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(isChecked) => {
                setTheme(isChecked ? "dark" : "light");
              }}
              testID="dark-mode-switch"
            />
          </View>

          <Separator className="bg-border" />

          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-foreground font-medium">Auto Sync</Text>
              <Text className="text-muted-foreground text-sm">
                Automatically sync activities when online
              </Text>
            </View>
            <Switch
              checked={true}
              onCheckedChange={() => {}}
              disabled
              testID="auto-sync-switch"
            />
          </View>
        </CardContent>
      </Card>

      {/* Account Actions Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-card-foreground">
            Account Actions
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Manage your account settings
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <Button
            variant="outline"
            onPress={() => router.push("/(external)/forgot-password")}
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

          <Separator className="bg-border" />

          <Button
            testID="sign-out-button"
            onPress={handleSignOut}
            disabled={signoutLoading}
          >
            <Text>{signoutLoading ? "Signing out..." : "Sign out"}</Text>
          </Button>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-card-foreground">About GradientPeak</CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          <Text className="text-muted-foreground">Version 1.0.0</Text>
          <Text className="text-muted-foreground">Build 12345</Text>
          <Button
            variant="link"
            onPress={() => console.log("View licenses")}
            className="self-start"
            testID="licenses-button"
          >
            <Text className="text-primary">View Licenses</Text>
          </Button>
        </CardContent>
      </Card>

      {/* Debug Info (Development only) */}
      {__DEV__ && (
        <Card className="bg-muted border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Debug Information
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <Text className="text-muted-foreground text-xs">
              User ID: {user?.id || "None"}
            </Text>
            <Text className="text-muted-foreground text-xs">
              Email: {user?.email || "None"}
            </Text>
            <Text className="text-muted-foreground text-xs">
              Profile ID: {profile?.id || "None"}
            </Text>
          </CardContent>
        </Card>
      )}
    </ScrollView>
  );
}
