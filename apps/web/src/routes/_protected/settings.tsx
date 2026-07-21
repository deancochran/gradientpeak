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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { LoadingButton } from "@repo/ui/components/loading";
import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  Camera,
  ImageIcon,
  Loader2,
  Mail,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { useAuth } from "../../components/providers/auth-provider";
import { useTheme } from "../../components/providers/theme-provider";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { signOutAction } from "../../lib/auth/server-actions";
import {
  changePasswordAction,
  resendVerificationFromSettingsAction,
  revokeOtherSessionsAction,
} from "../../lib/profile/account-settings";
import {
  getSettingsProfileFormDefaults,
  type SettingsProfileFormInput,
  type SettingsProfileFormValues,
  settingsProfileFormSchema,
} from "../../lib/profile/form-schemas";
import {
  removeProfileImageAction,
  updateSettingsProfileAction,
  uploadProfileAvatarAction,
} from "../../lib/profile/server-actions";
import { submitValidatedSettingsForm } from "../../lib/profile/settings-form-submit";

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
  const { data: profile, isLoading: profileLoading } = api.profiles.get.useQuery(undefined, {
    enabled: Boolean(user),
  });

  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [avatarFiles, setAvatarFiles] = useState<Array<{ file?: File; name: string }>>([]);
  const [coverBlobUrl, setCoverBlobUrl] = useState<string | null>(null);
  const [coverFiles, setCoverFiles] = useState<Array<{ file?: File; name: string }>>([]);
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const profileSubmitPendingRef = useRef(false);
  const loading = authLoading || profileLoading;
  const avatarFilePath =
    profile?.avatar_url && !isAbsoluteUrl(profile.avatar_url) ? profile.avatar_url : null;
  const coverFilePath =
    profile?.cover_url && !isAbsoluteUrl(profile.cover_url) ? profile.cover_url : null;

  const form = useForm<SettingsProfileFormInput, undefined, SettingsProfileFormValues>({
    resolver: zodResolver(settingsProfileFormSchema),
    defaultValues: getSettingsProfileFormDefaults(),
  });

  useEffect(() => {
    if (!profile || form.formState.isDirty) return;

    form.reset(getSettingsProfileFormDefaults(profile));
  }, [form, form.formState.isDirty, profile]);

  const { data: avatarUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: avatarFilePath || "" },
    { enabled: Boolean(avatarFilePath), refetchOnWindowFocus: false },
  );
  const { data: coverUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: coverFilePath || "" },
    { enabled: Boolean(coverFilePath), refetchOnWindowFocus: false },
  );

  useEffect(() => {
    setAvatarBlobUrl(
      avatarFilePath ? (avatarUrlData?.signedUrl ?? null) : (profile?.avatar_url ?? null),
    );
  }, [avatarFilePath, avatarUrlData?.signedUrl, profile?.avatar_url]);

  useEffect(() => {
    setCoverBlobUrl(
      coverFilePath ? (coverUrlData?.signedUrl ?? null) : (profile?.cover_url ?? null),
    );
  }, [coverFilePath, coverUrlData?.signedUrl, profile?.cover_url]);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (profileSubmitPendingRef.current) return;
    profileSubmitPendingRef.current = true;
    setSubmittingProfile(true);

    try {
      if (await submitValidatedSettingsForm(event, form.trigger)) return;
    } catch (error) {
      profileSubmitPendingRef.current = false;
      setSubmittingProfile(false);
      throw error;
    }

    profileSubmitPendingRef.current = false;
    setSubmittingProfile(false);
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
          coverBlobUrl={coverBlobUrl}
          coverFiles={coverFiles}
          form={form}
          profileUsername={profile?.username}
          submittingProfile={submittingProfile}
          userEmail={user?.email}
          onAvatarFilesChange={setAvatarFiles}
          onCoverFilesChange={setCoverFiles}
          onProfileSubmit={handleProfileSubmit}
        />
        <AccountInformationCard
          createdAt={createdAt}
          email={user?.email}
          emailVerified={user?.emailVerified}
        />
        <AppearanceCard />
        <SecurityCard
          {...(user?.email !== undefined ? { email: user.email } : {})}
          {...(user?.emailVerified !== undefined ? { emailVerified: user.emailVerified } : {})}
        />
        <DangerZoneCard />
      </div>
    </div>
  );
}

function ProfileInformationCard({
  avatarBlobUrl,
  avatarFiles,
  coverBlobUrl,
  coverFiles,
  form,
  profileUsername,
  submittingProfile,
  userEmail,
  onAvatarFilesChange,
  onCoverFilesChange,
  onProfileSubmit,
}: {
  avatarBlobUrl: string | null;
  avatarFiles: AvatarFile[];
  coverBlobUrl: string | null;
  coverFiles: AvatarFile[];
  form: UseFormReturn<SettingsProfileFormInput, undefined, SettingsProfileFormValues>;
  profileUsername?: string | null;
  submittingProfile: boolean;
  userEmail?: string | null;
  onAvatarFilesChange: (files: AvatarFile[]) => void;
  onCoverFilesChange: (files: AvatarFile[]) => void;
  onProfileSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const publicValue = form.watch("is_public");
  const isPublic = publicValue === true || publicValue === "true";

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
        <div className="overflow-hidden rounded-xl border bg-muted/30">
          {coverBlobUrl ? (
            <img src={coverBlobUrl} alt="Profile cover" className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
              <span>No cover photo</span>
            </div>
          )}
          <div className="flex flex-col gap-3 border-t bg-background p-3 sm:flex-row sm:items-end">
            <form
              action={uploadProfileAvatarAction.url}
              method="post"
              encType="multipart/form-data"
              className="flex-1 space-y-2"
            >
              <input type="hidden" name="field" value="cover_url" />
              <FileInput
                accept="image/*"
                buttonLabel="Choose cover"
                label="Cover photo upload"
                name="profile_image"
                files={coverFiles}
                onFilesChange={onCoverFilesChange}
              />
              <Button type="submit" variant="outline" disabled={coverFiles.length === 0}>
                Upload Cover
              </Button>
            </form>
            {coverBlobUrl ? (
              <form action={removeProfileImageAction.url} method="post">
                <input type="hidden" name="field" value="cover_url" />
                <Button type="submit" variant="ghost">
                  Remove Cover
                </Button>
              </form>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="group relative">
            <Avatar className="h-20 w-20 transition-all duration-200 group-hover:opacity-90">
              <AvatarImage src={avatarBlobUrl || ""} alt="User" />
              <AvatarFallback className="text-lg">
                <UserRound className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
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
            name="profile_image"
            files={avatarFiles}
            onFilesChange={onAvatarFilesChange}
          />
          <input type="hidden" name="field" value="avatar_url" />
          <Button type="submit" variant="outline" disabled={avatarFiles.length === 0}>
            Upload Avatar
          </Button>
        </form>
        {avatarBlobUrl ? (
          <form action={removeProfileImageAction.url} method="post">
            <input type="hidden" name="field" value="avatar_url" />
            <Button type="submit" variant="ghost">
              Remove Avatar
            </Button>
          </form>
        ) : null}
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
              description="Displayed as your profile name."
              label="Full name"
              name="full_name"
              placeholder="Enter your full name"
            />
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
            <FormSwitchField
              className="rounded-lg border p-4"
              control={form.control}
              description="Make your profile visible to everyone. Activity visibility is controlled separately below."
              label="Open profile"
              name="is_public"
              switchLabel="Open profile"
            />
            <input type="hidden" name="is_public" value={isPublic ? "true" : "false"} />
            <FormField
              control={form.control}
              name="default_content_visibility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default activity visibility</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      name={field.name}
                      value={field.value ?? "private"}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    >
                      <option value="private">Private</option>
                      <option value="followers">Followers</option>
                      <option value="public">Public</option>
                    </select>
                  </FormControl>
                  <FormDescription>
                    New activities use this unless you choose a different visibility.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <LoadingButton
              type="submit"
              disabled={submittingProfile || !form.formState.isDirty}
              loading={submittingProfile}
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

function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Choose a light, dark, or system-matched appearance.</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset className="grid grid-cols-3 gap-2" aria-label="Theme preference">
          {(["light", "dark", "system"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={theme === option ? "default" : "outline"}
              aria-pressed={theme === option}
              onClick={() => setTheme(option)}
              className="capitalize"
            >
              {option}
            </Button>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function SecurityCard({
  email,
  emailVerified,
}: {
  email?: string | null;
  emailVerified?: boolean | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Password and sessions
        </CardTitle>
        <CardDescription>
          Password changes keep this session active and revoke every other session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!emailVerified && email ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Verify your email</p>
              <p className="text-sm text-muted-foreground">
                Confirm {email} to secure account recovery.
              </p>
            </div>
            <form action={resendVerificationFromSettingsAction.url} method="post">
              <input type="hidden" name="email" value={email} />
              <Button type="submit" variant="outline">
                Resend verification
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Your email address is verified.</p>
        )}

        <form action={changePasswordAction.url} method="post" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use at least 8 characters, one uppercase letter, and one number.
          </p>
          <Button type="submit">Update password</Button>
        </form>

        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Other signed-in devices</p>
            <p className="text-sm text-muted-foreground">
              Revoke all sessions except the browser you are using now.
            </p>
          </div>
          <form action={revokeOtherSessionsAction.url} method="post">
            <Button type="submit" variant="outline">
              Sign out other sessions
            </Button>
          </form>
        </div>
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
