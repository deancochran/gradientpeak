import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Camera, Loader2, Mail, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { signOutAction } from "../../lib/auth/server-actions";
import {
  type SettingsProfileFormValues,
  settingsProfileFormSchema,
} from "../../lib/profile/form-schemas";
import {
  updateSettingsProfileAction,
  uploadProfileAvatarAction,
} from "../../lib/profile/server-actions";

type SettingsProfileFormInput = z.input<typeof settingsProfileFormSchema>;

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export const Route = createFileRoute("/_protected/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = Route.useNavigate();
  const { flash, flashType } = Route.useSearch();
  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = api.profiles.get.useQuery(undefined, {
    enabled: Boolean(user),
  });

  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [avatarFiles, setAvatarFiles] = useState<Array<{ file?: File; name: string }>>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const profileSubmitValidatedRef = useRef(false);
  const loading = authLoading || profileLoading;
  const avatarFilePath =
    profile?.avatar_url && !isAbsoluteUrl(profile.avatar_url) ? profile.avatar_url : null;

  const normalizedProfile = useMemo(() => normalizeProfileSettingsView(profile), [profile]);

  const form = useForm<SettingsProfileFormInput, undefined, SettingsProfileFormValues>({
    resolver: zodResolver(settingsProfileFormSchema),
    defaultValues: {
      is_public: false,
      username: "",
    },
  });

  useEffect(() => {
    if (!normalizedProfile || form.formState.isDirty) return;

    const defaults = getProfileQuickUpdateDefaults(normalizedProfile);
    form.reset({
      is_public: defaults.is_public ?? false,
      username: typeof defaults.username === "string" ? defaults.username : "",
    });
  }, [form, form.formState.isDirty, normalizedProfile]);

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
    if (profileSubmitValidatedRef.current) {
      profileSubmitValidatedRef.current = false;
      return;
    }

    event.preventDefault();
    const valid = await form.trigger();

    if (valid) {
      profileSubmitValidatedRef.current = true;
      event.currentTarget.requestSubmit();
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
          <RouteFlashToast
            message={flash}
            type={flashType}
            clear={() =>
              void navigate({
                to: "/settings",
                search: { flash: undefined, flashType: undefined },
                replace: true,
              })
            }
          />
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
                <Avatar className="h-20 w-20 transition-all duration-200 group-hover:opacity-90">
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
              </div>
              <div>
                <h3 className="font-medium">{profile?.username || "No name set"}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the upload field below to change your picture (max 5MB)
                </p>
              </div>
            </div>
            <form
              action={uploadProfileAvatarAction.url}
              method="post"
              encType="multipart/form-data"
              className="space-y-3"
            >
              <FileInput
                accept="image/*"
                buttonLabel="Upload avatar"
                label="Avatar upload"
                name="avatar"
                files={avatarFiles}
                onFilesChange={(files) => setAvatarFiles(files)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={uploadingAvatar || avatarFiles.length === 0}
              >
                {uploadingAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Upload Avatar
              </Button>
            </form>
            <Form {...form}>
              <form
                action={updateSettingsProfileAction.url}
                method="post"
                onSubmit={(event) => {
                  void handleProfileSubmit(event);
                }}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter your username" />
                      </FormControl>
                      <p className="text-sm text-muted-foreground">
                        This is the username that will be displayed on your profile.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_public"
                  render={({ field }) => (
                    <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-4">
                      <div className="space-y-1">
                        <FormLabel>Public Account</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Make your profile and activities visible to everyone.
                        </p>
                      </div>
                      <FormControl>
                        <>
                          <input
                            type="hidden"
                            name="is_public"
                            value={
                              field.value === true || field.value === "true" ? "true" : "false"
                            }
                          />
                          <Switch
                            checked={field.value === true || field.value === "true"}
                            onCheckedChange={field.onChange}
                          />
                        </>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || !form.formState.isDirty}
                >
                  {form.formState.isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Update Profile
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account Surfaces</CardTitle>
            <CardDescription>
              Progressive account flows are being split into dedicated web surfaces. Until those
              pages land, use this hub as the stable entry point.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <h3 className="font-medium">Profile Edit</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Username, avatar, and account visibility are already editable above.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-medium">Training Preferences</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Dedicated planning preferences are queued for the next account pass.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-medium">Integrations And Metrics</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Provider management and profile metrics will live alongside settings instead of
                hiding behind the avatar menu.
              </p>
            </div>
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
              <form action={signOutAction.url} method="post" className="flex-1">
                <Button variant="outline" type="submit" className="w-full">
                  Sign Out
                </Button>
              </form>
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
