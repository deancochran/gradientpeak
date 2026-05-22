import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Form,
  FormDateInputField,
  FormSegmentedSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { Camera, ImagePlus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { AppSelectionModal } from "@/components/shared/AppSelectionModal";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const profileEditSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").nullable(),
  bio: z.string().max(500, "Bio must be 500 characters or less").nullable(),
  dob: z.string().nullable(), // Format: YYYY-MM-DD
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
type ProfileImageFieldName = "avatar_url" | "cover_url";

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [uploadingImageField, setUploadingImageField] = useState<ProfileImageFieldName | null>(
    null,
  );
  const [imageSourceField, setImageSourceField] = useState<ProfileImageFieldName | null>(null);
  const [statusModal, setStatusModal] = useState<null | {
    title: string;
    description: string;
    onClose?: () => void;
  }>(null);
  const utils = api.useUtils();

  const updateProfileMutation = api.profiles.update.useMutation();
  const createAvatarUploadUrlMutation = api.storage.createSignedUploadUrl.useMutation();
  const avatarFilePath =
    profile?.avatar_url && !isAbsoluteUrl(profile.avatar_url) ? profile.avatar_url : null;
  const { data: avatarUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: avatarFilePath || "" },
    { enabled: Boolean(avatarFilePath) },
  );
  const coverFilePath =
    profile?.cover_url && !isAbsoluteUrl(profile.cover_url) ? profile.cover_url : null;
  const { data: coverUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: coverFilePath || "" },
    { enabled: Boolean(coverFilePath) },
  );

  const avatarUrl = avatarFilePath
    ? avatarUrlData?.signedUrl
      ? getReachableSupabaseStorageUrl(avatarUrlData.signedUrl)
      : null
    : profile?.avatar_url
      ? getReachableSupabaseStorageUrl(profile.avatar_url)
      : null;
  const coverUrl = coverFilePath
    ? coverUrlData?.signedUrl
      ? getReachableSupabaseStorageUrl(coverUrlData.signedUrl)
      : null
    : profile?.cover_url
      ? getReachableSupabaseStorageUrl(profile.cover_url)
      : null;
  const form = useZodForm({
    schema: profileEditSchema,
    defaultValues: {
      username: profile?.username || null,
      bio: profile?.bio || null,
      dob: profile?.dob || null,
      preferred_units: profile?.preferred_units || "metric",
      language: profile?.language || "en",
      is_public: profile?.is_public ?? true,
    },
  });
  const watchedUsername = form.watch("username");
  const watchedIsPublic = form.watch("is_public");
  const profileInitial = watchedUsername?.charAt(0)?.toUpperCase() || "U";

  useEffect(() => {
    form.reset({
      username: profile?.username || null,
      bio: profile?.bio || null,
      dob: profile?.dob || null,
      preferred_units: profile?.preferred_units || "metric",
      language: profile?.language || "en",
      is_public: profile?.is_public ?? true,
    });
  }, [form, profile]);

  const submitForm = useZodFormSubmit<ProfileEditForm>({
    form,
    shouldRethrow: false,
    onSubmit: async (data) => {
      await updateProfileMutation.mutateAsync({
        username: data.username || null,
        bio: data.bio || null,
        dob: data.dob || null,
        preferred_units: data.preferred_units || null,
        language: data.language || null,
        is_public: data.is_public ?? undefined,
      });

      await Promise.all([utils.profiles.invalidate(), refreshProfile()]);
      router.back();
    },
    onError: (error) =>
      handleSubmitFormError(form, error, { alertTitle: "Failed to update profile" }),
  });

  const isSavingProfile =
    submitForm.isSubmitting || updateProfileMutation.isPending || Boolean(uploadingImageField);

  const syncProfileImage = async (fieldName: ProfileImageFieldName, value: string | null) => {
    const updatedProfile = await updateProfileMutation.mutateAsync({ [fieldName]: value });

    useAuthStore.getState().setProfile(updatedProfile);
    await Promise.all([utils.profiles.invalidate(), refreshProfile()]);
  };

  const uploadProfileImage = async (fieldName: ProfileImageFieldName, uri: string) => {
    try {
      setUploadingImageField(fieldName);

      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `profile-${fieldName.replace("_url", "")}-${Date.now()}.${ext}`;
      const fileType: AvatarMimeType =
        AVATAR_MIME_TYPES[ext as keyof typeof AVATAR_MIME_TYPES] ?? "image/jpeg";

      const { signedUrl, publicUrl } = await createAvatarUploadUrlMutation.mutateAsync({
        fileName,
        fileType,
      });
      const reachableSignedUrl = getReachableSupabaseStorageUrl(signedUrl);
      const reachablePublicUrl = getReachableSupabaseStorageUrl(publicUrl);

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

      await syncProfileImage(fieldName, reachablePublicUrl);
    } catch (error) {
      console.error("Profile image upload error:", error);
      setStatusModal({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
      });
    } finally {
      setUploadingImageField(null);
    }
  };

  const pickProfileImage = async (
    fieldName: ProfileImageFieldName,
    source: "camera" | "library",
  ) => {
    try {
      setImageSourceField(null);
      const aspect: [number, number] = fieldName === "avatar_url" ? [1, 1] : [16, 9];
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Permission Required",
          source === "camera"
            ? "Camera permission is required to take photos."
            : "Please grant permission to access your photos.",
        );
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: "images",
              allowsEditing: true,
              aspect,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              allowsEditing: true,
              aspect,
              quality: 0.8,
            });

      if (!result.canceled && result.assets[0]?.uri) {
        await uploadProfileImage(fieldName, result.assets[0].uri);
      }
    } catch (error) {
      setStatusModal({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
      });
    }
  };

  const clearProfileImage = async (fieldName: ProfileImageFieldName) => {
    try {
      setUploadingImageField(fieldName);
      await syncProfileImage(fieldName, null);
    } catch (error) {
      setStatusModal({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to remove image",
      });
    } finally {
      setUploadingImageField(null);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      testID="profile-edit-screen"
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              disabled={isSavingProfile}
              onPress={submitForm.handleSubmit}
              size="sm"
              testID="profile-edit-save-button"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">
                {isSavingProfile ? "Saving..." : "Save"}
              </Text>
            </Button>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 gap-6"
        showsVerticalScrollIndicator={false}
      >
        <Card className="overflow-hidden rounded-3xl border border-border bg-card">
          <TouchableOpacity
            accessibilityLabel={coverUrl ? "Change profile cover photo" : "Add profile cover photo"}
            activeOpacity={0.9}
            className="relative bg-muted/40"
            disabled={Boolean(uploadingImageField)}
            onPress={() => setImageSourceField("cover_url")}
            testID="profile-edit-cover-button"
          >
            {coverUrl ? (
              <Image
                accessibilityLabel="Profile cover preview"
                className="h-36 w-full"
                resizeMode="cover"
                source={{ uri: coverUrl }}
              />
            ) : (
              <View className="h-36 items-center justify-center gap-2">
                <Icon as={ImagePlus} className="text-muted-foreground" size={24} />
                <Text className="text-center text-sm font-medium text-muted-foreground">
                  Add cover photo
                </Text>
              </View>
            )}
            <View className="absolute bottom-3 right-3 rounded-full bg-background/95 px-3 py-2 shadow-sm">
              {uploadingImageField === "cover_url" ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text className="text-xs font-semibold text-foreground">
                  {coverUrl ? "Change" : "Add"}
                </Text>
              )}
            </View>
            {coverUrl && uploadingImageField !== "cover_url" ? (
              <TouchableOpacity
                accessibilityLabel="Remove profile cover photo"
                activeOpacity={0.85}
                className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-background/95 shadow-sm"
                disabled={Boolean(uploadingImageField)}
                onPress={() => void clearProfileImage("cover_url")}
              >
                <Icon as={X} size={16} className="text-destructive" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          <CardContent className="gap-5 p-6">
            <Form {...form}>
              <View className="gap-5">
                <View className="flex-row items-start gap-4">
                  <View className="items-start">
                    <TouchableOpacity
                      accessibilityLabel={
                        avatarUrl ? "Change profile picture" : "Add profile picture"
                      }
                      activeOpacity={0.85}
                      className="relative"
                      disabled={Boolean(uploadingImageField)}
                      onPress={() => setImageSourceField("avatar_url")}
                      testID="profile-edit-avatar-button"
                    >
                      <Avatar alt={watchedUsername || "User"} className="h-24 w-24">
                        {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
                        <AvatarFallback>
                          <Text className="text-3xl font-semibold text-foreground">
                            {profileInitial}
                          </Text>
                        </AvatarFallback>
                      </Avatar>
                      <View className="absolute bottom-0 right-0 rounded-full bg-primary p-2">
                        {uploadingImageField === "avatar_url" ? (
                          <ActivityIndicator color="white" size="small" />
                        ) : (
                          <Icon as={Camera} size={18} className="text-primary-foreground" />
                        )}
                      </View>
                    </TouchableOpacity>
                    {avatarUrl && uploadingImageField !== "avatar_url" ? (
                      <TouchableOpacity
                        accessibilityLabel="Remove profile picture"
                        activeOpacity={0.85}
                        className="mt-2 self-center rounded-full px-3 py-1.5"
                        disabled={Boolean(uploadingImageField)}
                        onPress={() => void clearProfileImage("avatar_url")}
                      >
                        <Text className="text-xs font-semibold text-destructive">Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View className="min-w-0 flex-1 gap-3">
                    <FormTextField
                      control={form.control}
                      label="Username"
                      name="username"
                      parseValue={(value) => value || null}
                      placeholder="Enter username"
                    />
                    <View className="self-start rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {watchedIsPublic ? "Public profile" : "Private profile"}
                      </Text>
                    </View>
                  </View>
                </View>

                <FormTextareaField
                  control={form.control}
                  description="Max 500 characters. This appears below your profile identity."
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

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <View className="gap-4">
                <FormSegmentedSelectField
                  control={form.control}
                  description="Choose between km/kg or miles/lbs"
                  label="Preferred Units"
                  name="preferred_units"
                  options={[
                    { label: "Metric", value: "metric" },
                    { label: "Imperial", value: "imperial" },
                  ]}
                />

                <FormSwitchField
                  control={form.control}
                  description="Allow anyone to view your profile and activities"
                  label="Public Account"
                  name="is_public"
                />
              </View>
            </Form>
          </CardContent>
        </Card>
      </ScrollView>
      {imageSourceField ? (
        <AppSelectionModal
          description={`Choose how you want to update your ${imageSourceField === "avatar_url" ? "profile picture" : "cover photo"}.`}
          onClose={() => setImageSourceField(null)}
          testID="profile-avatar-source-modal"
          title={imageSourceField === "avatar_url" ? "Profile Picture" : "Cover Photo"}
        >
          <View className="gap-3">
            <TouchableOpacity
              onPress={() => {
                void pickProfileImage(imageSourceField, "camera");
              }}
              className="rounded-xl border border-border bg-card px-4 py-4"
              activeOpacity={0.8}
              testID="profile-avatar-source-camera"
            >
              <Text className="text-sm font-semibold text-foreground">Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void pickProfileImage(imageSourceField, "library");
              }}
              className="rounded-xl border border-border bg-card px-4 py-4"
              activeOpacity={0.8}
              testID="profile-avatar-source-library"
            >
              <Text className="text-sm font-semibold text-foreground">Choose from Library</Text>
            </TouchableOpacity>
          </View>
        </AppSelectionModal>
      ) : null}
      {statusModal ? (
        <AppConfirmModal
          description={statusModal.description}
          onClose={() => {
            const next = statusModal.onClose;
            setStatusModal(null);
            next?.();
          }}
          primaryAction={{
            label: "OK",
            onPress: () => {
              const next = statusModal.onClose;
              setStatusModal(null);
              next?.();
            },
            testID: "profile-edit-status-confirm",
          }}
          testID="profile-edit-status-modal"
          title={statusModal.title}
        />
      ) : null}
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
