import { calculateCriticalPower } from "@repo/core";
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
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, Loader2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";
import { applyServerFormErrors, showErrorAlert } from "@/lib/utils/formErrors";

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

const AVATAR_MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const;

type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[keyof typeof AVATAR_MIME_TYPES];

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const utils = api.useUtils();

  const { data: powerCurve } = api.analytics.getSeasonBestCurve.useQuery({
    activity_category: "bike",
    effort_type: "power",
    days: 90,
  });

  // Use stable date reference to prevent infinite refetch loops
  const [now] = useState(() => new Date());

  // Fetch LTHR from profile metrics
  const { data: lthrMetric } = api.profileMetrics.getAtDate.useQuery({
    metric_type: "lthr",
    date: now,
  });

  const updateProfileMutation = api.profiles.update.useMutation();
  const createAvatarUploadUrlMutation = api.storage.createSignedUploadUrl.useMutation();
  const avatarFilePath =
    profile?.avatar_url && !isAbsoluteUrl(profile.avatar_url) ? profile.avatar_url : null;
  const { data: avatarUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: avatarFilePath || "" },
    { enabled: Boolean(avatarFilePath) },
  );

  const avatarUrl = avatarFilePath
    ? (avatarUrlData?.signedUrl ?? null)
    : (profile?.avatar_url ?? null);
  const estimatedFTP = useMemo(() => {
    const model = calculateCriticalPower(powerCurve ?? []);

    if (!model) {
      return null;
    }

    return Math.round(model.cp + model.wPrime / 3600);
  }, [powerCurve]);

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

  const submitForm = useZodFormSubmit<ProfileEditForm>({
    form,
    onSubmit: async (data) => {
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

        await Promise.all([utils.profiles.invalidate(), refreshProfile()]);
        Alert.alert("Success", "Profile updated successfully!");

        if (!avatarUploadLoading) {
          router.back();
        }
      } catch (error) {
        if (applyServerFormErrors(form, error)) {
          return;
        }

        throw error;
      }
    },
  });

  useEffect(() => {
    if (submitForm.submitError) {
      showErrorAlert(submitForm.submitError, "Failed to update profile");
    }
  }, [submitForm.submitError]);

  const isSavingProfile = submitForm.isSubmitting || updateProfileMutation.isPending;

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
      const fileType: AvatarMimeType =
        AVATAR_MIME_TYPES[ext as keyof typeof AVATAR_MIME_TYPES] ?? "image/jpeg";

      const { signedUrl, publicUrl } = await createAvatarUploadUrlMutation.mutateAsync({
        fileName,
        fileType,
      });
      const reachableSignedUrl = getReachableSupabaseStorageUrl(signedUrl);

      // Create ExpoFile instance and ensure it exists before upload
      const file = new ExpoFile(uri);

      if (!file.exists) {
        throw new Error("Selected image could not be read");
      }

      const fileResponse = await fetch(file.uri);
      const blob = await fileResponse.blob();

      const uploadResponse = await fetch(reachableSignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": fileType,
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      // Update profile with new avatar URL
      const updatedProfile = await updateProfileMutation.mutateAsync({
        avatar_url: publicUrl,
      });

      useAuthStore.getState().setProfile(updatedProfile);

      await Promise.all([utils.profiles.invalidate(), refreshProfile()]);
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
                {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
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
                  <ActivityIndicator size="small" color="white" />
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
                      {estimatedFTP ? `${estimatedFTP} W` : "Not enough data"}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">
                      Read-only estimate from your best recent ride efforts (last 90 days).
                    </Text>
                  </View>
                </View>

                <View>
                  <Text className="text-sm font-medium mb-1">Threshold HR</Text>
                  <View className="bg-muted p-3 rounded-md">
                    {(() => {
                      const lthrValue = lthrMetric?.value == null ? null : Number(lthrMetric.value);
                      return (
                        <Text className="text-foreground">
                          {lthrValue != null ? `${Math.round(lthrValue)} bpm` : "Not detected yet"}
                        </Text>
                      );
                    })()}
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
            disabled={isSavingProfile}
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            className="flex-1"
            onPress={submitForm.handleSubmit}
            disabled={isSavingProfile}
            testID="profile-edit-save-button"
          >
            {isSavingProfile ? (
              <>
                <ActivityIndicator size="small" color="white" className="mr-2" />
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
