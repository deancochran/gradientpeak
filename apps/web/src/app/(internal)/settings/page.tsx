"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAuth } from "@/components/providers/auth-provider";
import { trpc } from "@/lib/trpc/client";

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
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Calendar,
  Camera,
  Loader2,
  Mail,
  Trash2,
  UserRound,
} from "lucide-react";

// Types removed - using tRPC generated types

// Zod schema for profile form validation
const profileSchema = z.object({
  username: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be less than 50 characters"),
});

export default function SettingsPage() {
  // Auth and Profile data
  const { user, isLoading: authLoading, refreshSession } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = trpc.profiles.get.useQuery(undefined, {
    enabled: !!user,
  });

  // Mutations
  const updateProfileMutation = trpc.profiles.update.useMutation({
    onSuccess: () => {
      refetchProfile();
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    },
  });
  const signOutMutation = trpc.auth.signOut.useMutation({
    onSuccess: () => {
      refreshSession();
      router.push("/auth/login");
      toast.success("Signed out successfully");
    },
    onError: (error) => {
      console.error("Error signing out:", error);
      toast.error("Failed to sign out");
    },
  });
  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation({
    onSuccess: () => {
      refreshSession();
      router.push("/auth/login");
      toast.success("Account deleted successfully");
    },
    onError: (error) => {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    },
  });
  const createSignedUploadUrlMutation =
    trpc.storage.createSignedUploadUrl.useMutation();
  // Local state
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const loading = authLoading || profileLoading;

  // Hooks
  const router = useRouter();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: "",
    },
  });

  // Update form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        username: profile.username || "",
      });
    }
  }, [profile, form]);

  // Get avatar URL when profile has avatar_url
  const { data: avatarUrlData } = trpc.storage.getSignedUrl.useQuery(
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
  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    if (!user) return;

    setUpdating(true);
    try {
      await updateProfileMutation.mutateAsync({
        username: values.username,
        weight_kg: profile?.weight_kg ?? null,
        ftp: profile?.ftp ?? null,
        threshold_hr: profile?.threshold_hr ?? null,
      });
    } catch {
      // Error handling is done in mutation onError
    } finally {
      setUpdating(false);
    }
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setUploadingAvatar(true);

      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }

      // Get signed upload URL
      const { signedUrl, path: filePath } =
        await createSignedUploadUrlMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
        });

      // Upload file directly to the signed URL
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      // Update profile with new avatar path
      await updateProfileMutation.mutateAsync({
        username: profile?.username || "",
        weight_kg: profile?.weight_kg ?? null,
        ftp: profile?.ftp ?? null,
        threshold_hr: profile?.threshold_hr ?? null,
        avatar_url: filePath,
      });

      toast.success("Avatar updated successfully");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setDeleting(true);
    try {
      await deleteAccountMutation.mutateAsync();
    } catch {
      // Error handling is done in mutation onError
    } finally {
      setDeleting(false);
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
          <p className="text-muted-foreground">
            Manage your account settings and preferences.
          </p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your profile information and avatar.
            </CardDescription>
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

                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <h3 className="font-medium">
                  {profile?.username || "No name set"}
                </h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click avatar to change picture (max 5MB)
                </p>
              </div>
            </div>

            {/* Profile Form */}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your username" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is the username that will be displayed on your
                        profile.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={updating}>
                  {updating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
            <CardDescription>
              View your account details and status.
            </CardDescription>
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
                  <Badge
                    variant={user?.email_confirmed_at ? "default" : "secondary"}
                  >
                    {user?.email_confirmed_at ? "Verified" : "Unverified"}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Account Created</Label>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {profile?.created_at
                    ? formatDate(profile.created_at)
                    : "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant="outline"
                onClick={() => signOutMutation.mutate()}
                disabled={signOutMutation.isPending}
                className="flex-1"
              >
                {signOutMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Sign Out
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={deleting}
                    className="flex-1"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete
                      your account and remove all your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Delete Account
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
