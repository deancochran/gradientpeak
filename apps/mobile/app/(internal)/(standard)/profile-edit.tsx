import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormDateInputField,
  FormSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
  FormWeightInputField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, Loader2, Upload } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { supabase } from "@/lib/supabase/client";
import { api } from "@/lib/api";

const profileEditSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").nullable(),
  bio: z.string().max(500, "Bio must be 500 characters or less").nullable(),
  dob: z.string().nullable(), // Format: YYYY-MM-DD
  weight_kg: z.number().min(1).max(500).nullable(),
  // ftp: z.number().min(1).max(1000).nullable(), // Deprecated: FTP is now calculated
  // threshold_hr: z.number().min(1).max(250).nullable(), // Deprecated: LTHR is now in profile_metrics
  preferred_units: z.enum(["metric", "imperial"]).nullable(),
  language: z.string().nullable(),
  is_public: z.boolean().nullable(),
});

type ProfileEditForm = z.infer<typeof profileEditSchema>;

function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const utils = api.useUtils();

  // Fetch estimated FTP
  const { data: estimatedFTP } = api.analytics.predictPerformance.useQuery({
    activity_category: "bike",
    effort_type: "power",
    duration: 3600, // 1 hour for FTP
  });

  // Use stable date reference to prevent infinite refetch loops
  const [now] = useState(() => new Date());

  // Fetch LTHR from profile metrics
  const { data: lthrMetric } = api.profileMetrics.getAtDate.useQuery({
    metric_type: "lthr",
    date: now,
  });

  const updateProfileMutation = useReliableMutation(api.profiles.update, {
    invalidate: [utils.profiles],
    success: "Profile updated successfully!",
    onSuccess: async () => {
      // Force refresh profile to update avatar in tabs
      await refreshProfile();
      // Only navigate back if not uploading avatar (avatar upload handles its own flow)
      if (!avatarUploadLoading) {
        router.back();
      }
    },
  });

  const form = useZodForm({
    schema: profileEditSchema,
    defaultValues: {
      username: profile?.username || null,
      bio: profile?.bio || null,
      dob: profile?.dob || null,
      weight_kg: profile?.weight_kg || null,
      preferred_units: profile?.preferred_units || "metric",
      language: profile?.language || "en",
      is_public: profile?.is_public ?? true,
    },
  });

  const preferredWeightUnit = form.watch("preferred_units") === "imperial" ? "lbs" : "kg";

  const onSubmit = async (data: ProfileEditForm) => {
    try {
      await updateProfileMutation.mutateAsync({
        username: data.username || undefined,
        bio: data.bio || undefined,
        dob: data.dob || undefined,
        weight_kg: data.weight_kg || undefined,
        preferred_units: data.preferred_units || undefined,
        language: data.language || undefined,
        is_public: data.is_public ?? undefined,
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  const handleAvatarUpload = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please grant permission to access your photos to upload an avatar.",
        [{ text: "OK" }],
      );
      return;
    }

    // Show options (Camera or Library)
    const showOptions = () => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Cancel", "Take Photo", "Choose from Library"],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              await launchCamera();
            } else if (buttonIndex === 2) {
              await launchImageLibrary();
            }
          },
        );
      } else {
        Alert.alert("Select Avatar", "Choose an option", [
          { text: "Cancel", style: "cancel" },
          { text: "Take Photo", onPress: launchCamera },
          { text: "Choose from Library", onPress: launchImageLibrary },
        ]);
      }
    };

    const launchCamera = async () => {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== "granted") {
        Alert.alert("Permission Required", "Camera permission is required to take photos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    };

    const launchImageLibrary = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    };

    showOptions();
  };

  const uploadAvatar = async (uri: string) => {
    try {
      setAvatarUploadLoading(true);

      // Get file extension
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `${profile?.id}/${fileName}`; // Store in user's folder

      // Create ExpoFile instance and get bytes
      const file = new ExpoFile(uri);
      const bytes = await file.bytes();

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(filePath, bytes, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-avatars").getPublicUrl(filePath);

      // Update profile with new avatar URL
      await updateProfileMutation.mutateAsync({
        avatar_url: publicUrl,
      });

      // Force immediate profile refresh to update UI
      await refreshProfile();

      Alert.alert("Success", "Avatar updated successfully!");
    } catch (error) {
      console.error("Avatar upload error:", error);
      Alert.alert(
        "Upload Failed",
        error instanceof Error ? error.message : "Failed to upload avatar",
      );
    } finally {
      setAvatarUploadLoading(false);
    }
  };

  // Helper function to convert base64 to blob
  const base64ToBlob = (base64: string, contentType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      testID="profile-edit-screen"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Picture</CardTitle>
            <CardDescription>Upload or change your profile avatar</CardDescription>
          </CardHeader>
          <CardContent className="items-center">
            <View className="relative mb-4">
              <Avatar alt={profile?.username || "User"} className="w-32 h-32">
                {profile?.avatar_url ? <AvatarImage source={{ uri: profile.avatar_url }} /> : null}
                <AvatarFallback>
                  <Text className="text-4xl">
                    {profile?.username?.charAt(0)?.toUpperCase() || "U"}
                  </Text>
                </AvatarFallback>
              </Avatar>

              <TouchableOpacity
                onPress={handleAvatarUpload}
                className="absolute bottom-0 right-0 bg-primary rounded-full p-2"
                disabled={avatarUploadLoading}
                testID="profile-edit-avatar-button"
              >
                {avatarUploadLoading ? (
                  <Icon as={Loader2} size={20} className="text-primary-foreground animate-spin" />
                ) : (
                  <Icon as={Camera} size={20} className="text-primary-foreground" />
                )}
              </TouchableOpacity>
            </View>

            <Button
              variant="outline"
              size="sm"
              onPress={handleAvatarUpload}
              disabled={avatarUploadLoading}
              testID="profile-edit-change-avatar-button"
            >
              <Text>{avatarUploadLoading ? "Uploading..." : "Change Avatar"}</Text>
            </Button>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Your basic profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <View className="gap-4">
                <FormTextField
                  control={form.control}
                  label="Username"
                  name="username"
                  parseValue={(value) => value || null}
                  placeholder="Enter username"
                />

                <FormTextareaField
                  control={form.control}
                  description="Brief description about yourself (max 500 characters)"
                  formatValue={(value) => value ?? ""}
                  label="Bio"
                  name="bio"
                  numberOfLines={4}
                  parseValue={(value) => value || null}
                  placeholder="Tell us about yourself..."
                  className="min-h-[100px]"
                />

                <FormDateInputField
                  control={form.control}
                  clearable
                  description="Used to estimate age-based training metrics."
                  label="Date of Birth"
                  maximumDate={new Date()}
                  name="dob"
                  placeholder="Select date"
                  testId="profile-edit-dob"
                  accessibilityHint="Set your date of birth"
                />
              </View>
            </Form>
          </CardContent>
        </Card>

        {/* Training Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Training Metrics</CardTitle>
            <CardDescription>Your physical and training zone information</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <View className="gap-4">
                <FormWeightInputField
                  control={form.control}
                  description={`Shown in ${preferredWeightUnit}. Used for calorie, W/kg, and readiness estimates. This stays saved as kilograms behind the scenes so existing analytics keep working.`}
                  label="Weight"
                  name="weight_kg"
                  placeholder={preferredWeightUnit === "kg" ? "70.0" : "154.3"}
                  unit={preferredWeightUnit}
                  testId="profile-edit-weight"
                />

                <View>
                  <Text className="text-sm font-medium mb-1">Estimated FTP</Text>
                  <View className="bg-muted p-3 rounded-md">
                    <Text className="text-foreground">
                      {estimatedFTP?.predicted_value
                        ? `${estimatedFTP.predicted_value} W`
                        : "Not enough data"}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">
                      Read-only estimate from your best recent ride efforts (last 90 days).
                    </Text>
                  </View>
                </View>

                <View>
                  <Text className="text-sm font-medium mb-1">Threshold HR</Text>
                  <View className="bg-muted p-3 rounded-md">
                    <Text className="text-foreground">
                      {lthrMetric?.value
                        ? `${Math.round(lthrMetric.value)} bpm`
                        : "Not detected yet"}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">
                      Read-only estimate from your strongest recent 20-minute heart rate effort.
                    </Text>
                  </View>
                </View>
              </View>
            </Form>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>App and display preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <View className="gap-4">
                <FormSelectField
                  control={form.control}
                  description="Choose between km/kg or miles/lbs"
                  label="Preferred Units"
                  name="preferred_units"
                  options={[
                    { label: "Metric", value: "metric" },
                    { label: "Imperial", value: "imperial" },
                  ]}
                  placeholder="Choose units"
                />

                <FormSwitchField
                  control={form.control}
                  description="Allow anyone to view your profile and activities"
                  label="Public Account"
                  name="is_public"
                  switchLabel="Public account visibility"
                />
              </View>
            </Form>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => router.back()}
            disabled={updateProfileMutation.isPending}
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            className="flex-1"
            onPress={form.handleSubmit(onSubmit)}
            disabled={updateProfileMutation.isPending}
            testID="profile-edit-save-button"
          >
            {updateProfileMutation.isPending ? (
              <>
                <Icon as={Loader2} size={16} className="animate-spin mr-2" />
                <Text>Saving...</Text>
              </>
            ) : (
              <Text>Save Changes</Text>
            )}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ProfileEditScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ProfileEditScreen />
    </ErrorBoundary>
  );
}
