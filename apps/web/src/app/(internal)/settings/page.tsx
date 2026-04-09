"use client";
import {
  getProfileQuickUpdateDefaults,
  normalizeProfileSettingsView,
  profileQuickUpdateSchema,
} from "@repo/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { FileInput } from "@repo/ui/components/file-input";
import { Form, FormSwitchField, FormTextField } from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Calendar, Camera, Loader2, Mail, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth-provider";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";

const webProfileSettingsSchema = profileQuickUpdateSchema.pick({
  username: true,
  is_public: true,
});

type WebProfileSettingsFormData = z.output<typeof webProfileSettingsSchema>;

const emptyProfileSettingsValues: z.input<typeof webProfileSettingsSchema> = {
  username: "",
  is_public: false,
};

export default function SettingsPage() {
  // Auth and Profile data
  const { user, isLoading: authLoading, refreshSession } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = api.profiles.get.useQuery(undefined, {
    enabled: !!user,
  });

  // Mutations
  const updateProfileMutation = api.profiles.update.useMutation({
    onSuccess: () => {
      refetchProfile();
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    },
  });
  const createSignedUploadUrlMutation = api.storage.createSignedUploadUrl.useMutation();
  // Local state
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const loading = authLoading || profileLoading;

  // Hooks
  const router = useRouter();

  const form = useZodForm({
    schema: webProfileSettingsSchema,
    defaultValues: emptyProfileSettingsValues,
  });
  const isProfileDirty = form.formState.isDirty;

  // Update form when profile data loads
  useEffect(() => {
    if (profile) {
      const defaults = getProfileQuickUpdateDefaults(normalizeProfileSettingsView(profile));

      if (isProfileDirty) {
        return;
      }

      form.reset({
        username: defaults.username,
        is_public: defaults.is_public,
      });
    }
  }, [form, isProfileDirty, profile]);

  // Get avatar URL when profile has avatar_url
  const { data: avatarUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: profile?.avatar_url || "" },
    {
      enabled: !!profile?.avatar_url,
      refetchOnWindowFocus: false,
    },
  );

  // Update avatar blob URL when data changes
  useEffect(() => {
    if (avatarUrlData?.signedUrl) {
      setAvatarBlobUrl(avatarUrlData.signedUrl);
    } else {
      setAvatarBlobUrl(null);
    }

    // Cleanup blob URL when component unmounts or avatar changes
    return () => {
      if (avatarBlobUrl) {
        URL.revokeObjectURL(avatarBlobUrl);
      }
    };
  }, [avatarUrlData?.signedUrl, avatarBlobUrl]);

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (avatarBlobUrl) {
        URL.revokeObjectURL(avatarBlobUrl);
      }
    };
  }, [avatarBlobUrl]);

  // Event handlers
  const submitProfile = useZodFormSubmit<WebProfileSettingsFormData>({
    form,
    onSubmit: async (values) => {
      if (!user) {
        return;
      }

      await updateProfileMutation.mutateAsync({
        username: values.username,
        is_public: values.is_public,
      });

      form.reset(values);
    },
  });

  const handleAvatarUpload = async (
    files: Array<{ file?: File; name: string; type?: string | null; size?: number | null }>,
  ) => {
    const file = files[0]?.file;
    if (!file || !user) return;

    try {
      setUploadingAvatar(true);

      // Validate file type
      if (!allowedAvatarMimeTypes.includes(file.type as AllowedAvatarMimeType)) {
        toast.error("Please select an image file");
        return;
      }

      const fileType = file.type as AllowedAvatarMimeType;

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }

      // Get signed upload URL
      const { signedUrl, path: filePath } = await createSignedUploadUrlMutation.mutateAsync({
        fileName: file.name,
        fileType,
      });

      // Upload file directly to the signed URL
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": fileType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      // Update profile with new avatar path
      await updateProfileMutation.mutateAsync({
        username: profile?.username || "",
        avatar_url: filePath,
      });

      toast.success("Avatar updated successfully");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();

      if (result.error) {
        throw result.error;
      }

      await refreshSession();
      router.refresh();
      router.push("/auth/login");
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences.</p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your profile information and avatar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
              <div className="relative group">
                <Avatar className="h-20 w-20 cursor-pointer transition-all duration-200 group-hover:opacity-70">
                  <AvatarImage src={avatarBlobUrl || ""} alt={"User"} />
                  <AvatarFallback className="text-lg">
                    <UserRound className="h-8 w-8" />
                  </AvatarFallback>
                </Avatar>

                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {uploadingAvatar ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </div>

                <div className="absolute inset-0 opacity-0">
                  <FileInput
                    accept="image/*"
                    buttonLabel="Upload avatar"
                    label="Avatar upload"
                    onFilesChange={handleAvatarUpload}
                  />
                </div>
              </div>

              <div>
                <h3 className="font-medium">{profile?.username || "No name set"}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click avatar to change picture (max 5MB)
                </p>
              </div>
            </div>

            {/* Profile Form */}
            <Form {...form}>
              <form onSubmit={submitProfile.handleSubmit} className="space-y-4">
                <FormTextField
                  control={form.control}
                  description="This is the username that will be displayed on your profile."
                  label="Username"
                  name="username"
                  placeholder="Enter your username"
                />

                <FormSwitchField
                  control={form.control}
                  description="Make your profile and activities visible to everyone."
                  label="Public Account"
                  name="is_public"
                  switchLabel="Profile visibility"
                  testId="profile-visibility-switch"
                />

                <Button type="submit" disabled={submitProfile.isSubmitting || !isProfileDirty}>
                  {submitProfile.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Profile
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>View your account details and status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Email Verified</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={user?.emailVerified ? "default" : "secondary"}>
                    {user?.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Account Created</Label>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {profile?.created_at ? formatDate(profile.created_at) : "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible and destructive actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-1"
              >
                {signingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign Out
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Account deletion is temporarily unavailable</AlertDialogTitle>
                    <AlertDialogDescription>
                      We are finishing our authentication migration. If you need your account
                      removed right now, please contact support and we will handle it manually.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled className="bg-destructive">
                      Delete Account Unavailable
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
const allowedAvatarMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type AllowedAvatarMimeType = (typeof allowedAvatarMimeTypes)[number];
