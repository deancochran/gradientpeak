import { getProfileQuickUpdateDefaults, normalizeProfileSettingsView } from "@repo/core/profile";
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
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Calendar, Camera, Loader2, Mail, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "../../components/providers/auth-provider";
import { api } from "../../lib/api/client";
import { authClient } from "../../lib/auth/client";

const allowedAvatarMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type AllowedAvatarMimeType = (typeof allowedAvatarMimeTypes)[number];

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, refreshSession } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = api.profiles.get.useQuery(undefined, {
    enabled: Boolean(user),
  });

  const updateProfileMutation = api.profiles.update.useMutation({
    onSuccess: async () => {
      await refetchProfile();
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    },
  });

  const createSignedUploadUrlMutation = api.storage.createSignedUploadUrl.useMutation();
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const loading = authLoading || profileLoading;
  const avatarFilePath =
    profile?.avatar_url && !isAbsoluteUrl(profile.avatar_url) ? profile.avatar_url : null;

  const normalizedProfile = useMemo(() => normalizeProfileSettingsView(profile), [profile]);

  useEffect(() => {
    if (!normalizedProfile || isProfileDirty) return;
    const defaults = getProfileQuickUpdateDefaults(normalizedProfile);
    setUsername(typeof defaults.username === "string" ? defaults.username : "");
    setIsPublic(defaults.is_public ?? false);
  }, [isProfileDirty, normalizedProfile]);

  const { data: avatarUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: avatarFilePath || "" },
    { enabled: Boolean(avatarFilePath), refetchOnWindowFocus: false },
  );

  useEffect(() => {
    setAvatarBlobUrl(
      avatarFilePath ? (avatarUrlData?.signedUrl ?? null) : (profile?.avatar_url ?? null),
    );
  }, [avatarFilePath, avatarUrlData?.signedUrl, profile?.avatar_url]);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateProfileMutation.mutateAsync({ username, is_public: isPublic });
    setIsProfileDirty(false);
  };

  const handleAvatarUpload = async (files: Array<{ file?: File }>) => {
    const file = files[0]?.file;
    if (!file || !user) return;

    try {
      setUploadingAvatar(true);
      if (!allowedAvatarMimeTypes.includes(file.type as AllowedAvatarMimeType)) {
        toast.error("Please select an image file");
        return;
      }
      const fileType = file.type as AllowedAvatarMimeType;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }

      const { signedUrl, publicUrl } = await createSignedUploadUrlMutation.mutateAsync({
        fileName: file.name,
        fileType,
      });

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": fileType },
      });

      if (!uploadResponse.ok) throw new Error("Upload failed");

      await updateProfileMutation.mutateAsync({
        username: profile?.username || "",
        avatar_url: publicUrl,
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
      if (result.error) throw result.error;
      await refreshSession();
      toast.success("Signed out successfully");
      await navigate({ to: "/auth/login" });
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  return (
    <div className="container mx-auto max-w-4xl py-4">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your profile information and avatar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="group relative">
                <Avatar className="h-20 w-20 cursor-pointer transition-all duration-200 group-hover:opacity-70">
                  <AvatarImage src={avatarBlobUrl || ""} alt="User" />
                  <AvatarFallback className="text-lg">
                    <UserRound className="h-8 w-8" />
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {uploadingAvatar ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Click avatar to change picture (max 5MB)
                </p>
              </div>
            </div>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-username">Username</Label>
                <Input
                  id="settings-username"
                  value={username}
                  placeholder="Enter your username"
                  onChange={(event) => {
                    setUsername(event.currentTarget.value);
                    setIsProfileDirty(true);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  This is the username that will be displayed on your profile.
                </p>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor="settings-public-account">Public Account</Label>
                  <p className="text-sm text-muted-foreground">
                    Make your profile and activities visible to everyone.
                  </p>
                </div>
                <Switch
                  id="settings-public-account"
                  checked={isPublic}
                  onCheckedChange={(checked) => {
                    setIsPublic(checked);
                    setIsProfileDirty(true);
                  }}
                />
              </div>
              <Button type="submit" disabled={updateProfileMutation.isPending || !isProfileDirty}>
                {updateProfileMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Update Profile
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>View your account details and status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Email Verified</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={user?.emailVerified ? "default" : "secondary"}>
                    {user?.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Account Created</Label>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {createdAt}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible and destructive actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-1"
              >
                {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Sign Out
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
