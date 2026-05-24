import { zodResolver } from "@hookform/resolvers/zod";
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
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { LoadingButton } from "@repo/ui/components/loading";
import { Switch } from "@repo/ui/components/switch";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Camera, Loader2, Mail, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { useAuth } from "../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { signOutAction } from "../../lib/auth/server-actions";
import {
  type SettingsProfileFormInput,
  type SettingsProfileFormValues,
  settingsProfileFormSchema,
} from "../../lib/profile/form-schemas";
import {
  updateSettingsProfileAction,
  uploadProfileAvatarAction,
} from "../../lib/profile/server-actions";

type AvatarFile = { file?: File; name: string };

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
  const [uploadingAvatar, _setUploadingAvatar] = useState(false);
  const profileSubmitValidatedRef = useRef(false);
  const loading = authLoading || profileLoading;
  const avatarFilePath =
    profile?.avatar_url && !isAbsoluteUrl(profile.avatar_url) ? profile.avatar_url : null;

  const form = useForm<SettingsProfileFormInput, undefined, SettingsProfileFormValues>({
    resolver: zodResolver(settingsProfileFormSchema),
    defaultValues: {
      bio: "",
      is_public: false,
      language: "",
      preferred_units: "metric",
      username: "",
    },
  });

  useEffect(() => {
    if (!profile || form.formState.isDirty) return;

    form.reset({
      bio: profile.bio ?? "",
      is_public: profile.is_public ?? false,
      language: profile.language ?? "",
      preferred_units: profile.preferred_units ?? "metric",
      username: profile.username ?? "",
    });
  }, [form, form.formState.isDirty, profile]);

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
        <ProfileInformationCard
          avatarBlobUrl={avatarBlobUrl}
          avatarFiles={avatarFiles}
          form={form}
          profileUsername={profile?.username}
          uploadingAvatar={uploadingAvatar}
          userEmail={user?.email}
          onAvatarFilesChange={setAvatarFiles}
          onProfileSubmit={handleProfileSubmit}
        />
        <AccountInformationCard
          createdAt={createdAt}
          email={user?.email}
          emailVerified={user?.emailVerified}
        />
        <DangerZoneCard />
      </div>
    </div>
  );
}

function ProfileInformationCard({
  avatarBlobUrl,
  avatarFiles,
  form,
  profileUsername,
  uploadingAvatar,
  userEmail,
  onAvatarFilesChange,
  onProfileSubmit,
}: {
  avatarBlobUrl: string | null;
  avatarFiles: AvatarFile[];
  form: UseFormReturn<SettingsProfileFormInput, undefined, SettingsProfileFormValues>;
  profileUsername?: string | null;
  uploadingAvatar: boolean;
  userEmail?: string | null;
  onAvatarFilesChange: (files: AvatarFile[]) => void;
  onProfileSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
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
            <h3 className="font-medium">{profileUsername || "No name set"}</h3>
            <p className="text-sm text-muted-foreground">{userEmail}</p>
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
            onFilesChange={onAvatarFilesChange}
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
              void onProfileSubmit(event);
            }}
            className="space-y-4"
          >
            <FormTextField
              control={form.control}
              description="This is the username that will be displayed on your profile."
              label="Username"
              name="username"
              placeholder="Enter your username"
            />
            <FormTextareaField
              control={form.control}
              description="Shown anywhere your public profile is visible."
              label="Bio"
              name="bio"
              placeholder="Add a short profile bio"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="preferred_units"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred units</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        name={field.name}
                        value={field.value ?? "metric"}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                      >
                        <option value="metric">Metric</option>
                        <option value="imperial">Imperial</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormTextField
                control={form.control}
                label="Language"
                name="language"
                placeholder="en"
              />
            </div>
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
                    <input
                      type="hidden"
                      name="is_public"
                      value={field.value === true || field.value === "true" ? "true" : "false"}
                    />
                    <Switch
                      checked={field.value === true || field.value === "true"}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <LoadingButton
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isDirty}
              loading={form.formState.isSubmitting}
              loadingLabel="Updating..."
            >
              Update Profile
            </LoadingButton>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function AccountInformationCard({
  createdAt,
  email,
  emailVerified,
}: {
  createdAt: string;
  email?: string | null;
  emailVerified?: boolean | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Account Information
        </CardTitle>
        <CardDescription>View your account details and manage your session.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Email Verified</Label>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={emailVerified ? "default" : "secondary"}>
                {emailVerified ? "Verified" : "Unverified"}
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
        <form action={signOutAction.url} method="post">
          <Button variant="outline" type="submit">
            Sign Out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZoneCard() {
  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>Irreversible and destructive actions.</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Account deletion is temporarily unavailable</AlertDialogTitle>
              <AlertDialogDescription>
                We are finishing our authentication migration. If you need your account removed
                right now, please contact support and we will handle it manually.
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
      </CardContent>
    </Card>
  );
}
