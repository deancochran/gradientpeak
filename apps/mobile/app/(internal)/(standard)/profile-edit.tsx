import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Camera, Loader2, Upload } from "lucide-react-native";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { supabase } from "@/lib/supabase/client";
import { File as ExpoFile } from "expo-file-system";

const profileEditSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .nullable(),
  bio: z.string().max(500, "Bio must be 500 characters or less").nullable(),
  dob: z.string().nullable(), // Format: YYYY-MM-DD
  weight_kg: z.number().min(1).max(500).nullable(),
  ftp: z.number().min(1).max(1000).nullable(),
  threshold_hr: z.number().min(1).max(250).nullable(),
  preferred_units: z.enum(["metric", "imperial"]).nullable(),
  language: z.string().nullable(),
});

type ProfileEditForm = z.infer<typeof profileEditSchema>;

function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const utils = trpc.useUtils();

  const updateProfileMutation = useReliableMutation(trpc.profiles.update, {
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

  const form = useForm<ProfileEditForm>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      username: profile?.username || null,
      bio: profile?.bio || null,
      dob: profile?.dob || null,
      weight_kg: profile?.weight_kg || null,
      ftp: profile?.ftp || null,
      threshold_hr: profile?.threshold_hr || null,
      preferred_units: profile?.preferred_units || "metric",
      language: profile?.language || "en",
    },
  });

  const onSubmit = async (data: ProfileEditForm) => {
    try {
      await updateProfileMutation.mutateAsync({
        username: data.username || undefined,
        bio: data.bio || undefined,
        dob: data.dob || undefined,
        weight_kg: data.weight_kg || undefined,
        ftp: data.ftp || undefined,
        threshold_hr: data.threshold_hr || undefined,
        preferred_units: data.preferred_units || undefined,
        language: data.language || undefined,
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
      const { status: cameraStatus } =
        await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== "granted") {
        Alert.alert(
          "Permission Required",
          "Camera permission is required to take photos.",
        );
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
            <CardDescription>
              Upload or change your profile avatar
            </CardDescription>
          </CardHeader>
          <CardContent className="items-center">
            <View className="relative mb-4">
              <Avatar alt={profile?.username || "User"} className="w-32 h-32">
                {profile?.avatar_url ? (
                  <AvatarImage source={{ uri: profile.avatar_url }} />
                ) : null}
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
              >
                {avatarUploadLoading ? (
                  <Icon
                    as={Loader2}
                    size={20}
                    className="text-primary-foreground animate-spin"
                  />
                ) : (
                  <Icon
                    as={Camera}
                    size={20}
                    className="text-primary-foreground"
                  />
                )}
              </TouchableOpacity>
            </View>

            <Button
              variant="outline"
              size="sm"
              onPress={handleAvatarUpload}
              disabled={avatarUploadLoading}
            >
              <Text>
                {avatarUploadLoading ? "Uploading..." : "Change Avatar"}
              </Text>
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
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about yourself..."
                          value={field.value || ""}
                          onChangeText={field.onChange}
                          numberOfLines={4}
                          className="min-h-[100px]"
                        />
                      </FormControl>
                      <FormDescription>
                        Brief description about yourself (max 500 characters)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="YYYY-MM-DD"
                          value={field.value || ""}
                          onChangeText={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Format: YYYY-MM-DD (e.g., 1990-01-15)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </View>
            </Form>
          </CardContent>
        </Card>

        {/* Training Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Training Metrics</CardTitle>
            <CardDescription>
              Your physical and training zone information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <View className="gap-4">
                <FormField
                  control={form.control}
                  name="weight_kg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (kg)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter weight"
                          value={field.value ? field.value.toString() : ""}
                          onChangeText={(text) => {
                            const num = text ? Number(text) : null;
                            field.onChange(num);
                          }}
                          keyboardType="numeric"
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
                            const num = text ? Number(text) : null;
                            field.onChange(num);
                          }}
                          keyboardType="numeric"
                        />
                      </FormControl>
                      <FormDescription>
                        Functional Threshold Power for cycling
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="threshold_hr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Threshold HR (bpm)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter threshold HR"
                          value={field.value ? field.value.toString() : ""}
                          onChangeText={(text) => {
                            const num = text ? Number(text) : null;
                            field.onChange(num);
                          }}
                          keyboardType="numeric"
                        />
                      </FormControl>
                      <FormDescription>
                        Lactate Threshold Heart Rate
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <FormField
                  control={form.control}
                  name="preferred_units"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Units</FormLabel>
                      <View className="flex-row gap-2">
                        <Button
                          variant={
                            field.value === "metric" ? "default" : "outline"
                          }
                          className="flex-1"
                          onPress={() => field.onChange("metric")}
                        >
                          <Text>Metric</Text>
                        </Button>
                        <Button
                          variant={
                            field.value === "imperial" ? "default" : "outline"
                          }
                          className="flex-1"
                          onPress={() => field.onChange("imperial")}
                        >
                          <Text>Imperial</Text>
                        </Button>
                      </View>
                      <FormDescription>
                        Choose between km/kg or miles/lbs
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
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
