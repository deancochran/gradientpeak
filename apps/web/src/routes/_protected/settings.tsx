import { zodResolver } from "@hookform/resolvers/zod";
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
  FormDateInputField,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
  FormTimezoneField,
} from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { LoadingButton } from "@repo/ui/components/loading";
import { useZodForm } from "@repo/ui/hooks";
import { createFileRoute, isRedirect, Link } from "@tanstack/react-router";
import {
  Calendar,
  Camera,
  ImageIcon,
  Loader2,
  Mail,
  Shield,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { useAuth } from "../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import {
  AppearanceCard,
  ProductAnalyticsCard,
} from "../../components/settings/settings-preferences-cards";
import { SettingsSectionNavigation } from "../../components/settings/settings-section-navigation";
import { api } from "../../lib/api/client";
import { loadRouteQuery } from "../../lib/api/route-loading";
import { signOutAction } from "../../lib/auth/server-actions";
import { contractEpochFormInputProps } from "../../lib/contract-epoch";
import {
  changePasswordAction,
  resendVerificationFromSettingsAction,
  revokeOtherSessionsAction,
} from "../../lib/profile/account-settings";
import {
  changePasswordFormSchema,
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
import { useFormServerFn } from "../../lib/use-form-server-fn";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";

type AvatarFile = { file?: File | undefined; name: string };
type ProfileMediaField = "avatar_url" | "cover_url";
type ProfileMediaOperation = "upload" | "remove";

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export const Route = createFileRoute("/_protected/settings")({
  loader: ({ context }) =>
    loadRouteQuery(
      () => context.apiUtils.profiles.get.getData(),
      () => context.apiUtils.profiles.get.fetch(),
    ),
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: SettingsPage,
});

export function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = Route.useNavigate();
  const { flash, flashType } = Route.useSearch();
  const utils = api.useUtils();
  const { data: profile, isLoading: profileLoading } = api.profiles.get.useQuery(undefined, {
    enabled: Boolean(user),
  });

  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [avatarFiles, setAvatarFiles] = useState<AvatarFile[]>([]);
  const [coverBlobUrl, setCoverBlobUrl] = useState<string | null>(null);
  const [coverFiles, setCoverFiles] = useState<AvatarFile[]>([]);
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [mediaErrors, setMediaErrors] = useState<Partial<Record<ProfileMediaField, string>>>({});
  const [mediaOperations, setMediaOperations] = useState<
    Partial<Record<ProfileMediaField, ProfileMediaOperation>>
  >({});
  const profileSubmitPendingRef = useRef(false);
  const profileSubmissionRef = useRef(0);
  const profileSubmissionOwnerRef = useRef<string | null>(null);
  const profileOwnerRef = useRef<string | null>(null);
  const activeProfileOwnerRef = useRef(user?.id ?? null);
  const mediaOperationRef = useRef<Record<ProfileMediaField, number>>({
    avatar_url: 0,
    cover_url: 0,
  });
  const loading = authLoading || profileLoading;
  const activeProfile = profile?.id === user?.id ? profile : null;
  const avatarFilePath =
    activeProfile?.avatar_url && !isAbsoluteUrl(activeProfile.avatar_url)
      ? activeProfile.avatar_url
      : null;
  const coverFilePath =
    activeProfile?.cover_url && !isAbsoluteUrl(activeProfile.cover_url)
      ? activeProfile.cover_url
      : null;

  const form = useForm<SettingsProfileFormInput, undefined, SettingsProfileFormValues>({
    resolver: zodResolver(settingsProfileFormSchema),
    defaultValues: getSettingsProfileFormDefaults(),
  });

  // Effects run after paint; invalidate an old account's request during render so
  // its completion cannot release the next account's unsaved-change guard.
  if (activeProfileOwnerRef.current !== (user?.id ?? null)) {
    activeProfileOwnerRef.current = user?.id ?? null;
    profileSubmissionRef.current += 1;
    profileSubmitPendingRef.current = false;
    mediaOperationRef.current.avatar_url += 1;
    mediaOperationRef.current.cover_url += 1;
  }

  useEffect(() => {
    if (!user?.id) {
      profileOwnerRef.current = null;
      form.reset(getSettingsProfileFormDefaults());
      setAvatarFiles([]);
      setCoverFiles([]);
      setAvatarBlobUrl(null);
      setCoverBlobUrl(null);
      setMediaErrors({});
      setMediaOperations({});
      setSubmittingProfile(false);
      setProfileSaveError(null);
      return;
    }

    if (profileOwnerRef.current !== user.id) {
      profileOwnerRef.current = user.id;
      form.reset(getSettingsProfileFormDefaults());
      setAvatarFiles([]);
      setCoverFiles([]);
      setAvatarBlobUrl(null);
      setCoverBlobUrl(null);
      setMediaErrors({});
      setMediaOperations({});
      setSubmittingProfile(false);
      setProfileSaveError(null);
    }
  }, [form, user?.id]);

  useEffect(() => {
    if (!profile || profile.id !== user?.id) return;

    // Keep fields being edited while accepting server refreshes for untouched fields.
    form.reset(getSettingsProfileFormDefaults(profile), { keepDirtyValues: true });
  }, [form, profile, user?.id]);

  const { data: avatarUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: avatarFilePath || "" },
    { enabled: Boolean(avatarFilePath), refetchOnWindowFocus: false },
  );
  const { data: coverUrlData } = api.storage.getSignedUrl.useQuery(
    { filePath: coverFilePath || "" },
    { enabled: Boolean(coverFilePath), refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (!activeProfile) return;
    setAvatarBlobUrl(
      avatarFilePath ? (avatarUrlData?.signedUrl ?? null) : (activeProfile.avatar_url ?? null),
    );
  }, [activeProfile, avatarFilePath, avatarUrlData?.signedUrl]);

  useEffect(() => {
    if (!activeProfile) return;
    setCoverBlobUrl(
      coverFilePath ? (coverUrlData?.signedUrl ?? null) : (activeProfile.cover_url ?? null),
    );
  }, [activeProfile, coverFilePath, coverUrlData?.signedUrl]);

  const { markSaveFailed, markSaved } = useUnsavedChangesGuard({
    draft: form.watch(),
    dirty: form.formState.isDirty,
    message: "Discard unsaved profile changes?",
    pending: submittingProfile,
  });
  const updateProfile = useFormServerFn(updateSettingsProfileAction, () => {
    if (profileSubmissionOwnerRef.current === activeProfileOwnerRef.current) markSaved();
  });
  const uploadProfileMedia = useFormServerFn(uploadProfileAvatarAction, () => undefined);
  const removeProfileMedia = useFormServerFn(removeProfileImageAction, () => undefined);

  const handleMediaSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    field: ProfileMediaField,
    operation: ProfileMediaOperation,
  ) => {
    event.preventDefault();
    if (mediaOperations[field]) return;

    // FormData must be captured before awaiting so browser event pooling cannot lose the file.
    const data = new FormData(event.currentTarget);
    data.set("__async", "true");
    const owner = activeProfileOwnerRef.current;
    const request = ++mediaOperationRef.current[field];
    const isCurrent = () =>
      activeProfileOwnerRef.current === owner && mediaOperationRef.current[field] === request;
    setMediaErrors((errors) => ({ ...errors, [field]: undefined }));
    setMediaOperations((operations) => ({ ...operations, [field]: operation }));

    try {
      if (operation === "upload") {
        const result = await uploadProfileMedia({ data });
        if (!isCurrent()) return;
        if (field === "avatar_url") {
          setAvatarFiles([]);
          setAvatarBlobUrl(result.url);
        } else {
          setCoverFiles([]);
          setCoverBlobUrl(result.url);
        }
      } else {
        await removeProfileMedia({ data });
        if (!isCurrent()) return;
        if (field === "avatar_url") {
          setAvatarBlobUrl(null);
        } else {
          setCoverBlobUrl(null);
        }
      }
      void utils.profiles.get.invalidate();
    } catch (error) {
      if (!isCurrent()) return;
      setMediaErrors((errors) => ({
        ...errors,
        [field]:
          error instanceof Error
            ? error.message
            : `Profile ${operation === "upload" ? "image upload" : "image removal"} failed.`,
      }));
    } finally {
      if (isCurrent()) {
        setMediaOperations((operations) => ({ ...operations, [field]: undefined }));
      }
    }
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (profileSubmitPendingRef.current) return;
    const submittingUserId = activeProfileOwnerRef.current;
    const submission = ++profileSubmissionRef.current;
    const isCurrentSubmission = () =>
      profileSubmissionRef.current === submission &&
      activeProfileOwnerRef.current === submittingUserId;
    profileSubmitPendingRef.current = true;
    profileSubmissionOwnerRef.current = submittingUserId;
    setSubmittingProfile(true);
    setProfileSaveError(null);

    try {
      if (!(await form.trigger())) {
        return;
      }
      await updateProfile({ data: new FormData(formElement) });
    } catch (error) {
      if (isRedirect(error)) throw error;
      if (!isCurrentSubmission()) return;
      markSaveFailed();
      setProfileSaveError(
        error instanceof Error ? error.message : "Profile could not be updated. Please try again.",
      );
    } finally {
      if (isCurrentSubmission()) {
        profileSubmitPendingRef.current = false;
        setSubmittingProfile(false);
      }
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
            {...(flash === undefined ? {} : { message: flash })}
            {...(flashType === undefined ? {} : { type: flashType })}
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
          <div className="mt-4">
            <SettingsSectionNavigation />
          </div>
        </div>
        <section id="profile" aria-labelledby="profile-heading" className="scroll-mt-6">
          <ProfileInformationCard
            avatarBlobUrl={avatarBlobUrl}
            avatarFiles={avatarFiles}
            coverBlobUrl={coverBlobUrl}
            coverFiles={coverFiles}
            coverError={mediaErrors.cover_url ?? null}
            coverPending={mediaOperations.cover_url ?? null}
            form={form}
            profileSaveError={profileSaveError}
            {...(profile?.username === undefined ? {} : { profileUsername: profile.username })}
            submittingProfile={submittingProfile}
            {...(user?.email === undefined ? {} : { userEmail: user.email })}
            avatarError={mediaErrors.avatar_url ?? null}
            avatarPending={mediaOperations.avatar_url ?? null}
            onAvatarFilesChange={setAvatarFiles}
            onCoverFilesChange={setCoverFiles}
            onMediaSubmit={handleMediaSubmit}
            onProfileSubmit={handleProfileSubmit}
          />
        </section>
        <MyGroupsCard />
        <section id="account" aria-labelledby="account-heading" className="scroll-mt-6">
          <AccountInformationCard
            key={`account:${user?.id}`}
            {...(user?.id === undefined ? {} : { accountId: user.id })}
            createdAt={createdAt}
            {...(user?.email === undefined ? {} : { email: user.email })}
            {...(user?.emailVerified === undefined ? {} : { emailVerified: user.emailVerified })}
          />
        </section>
        <section id="preferences" aria-label="Preferences" className="scroll-mt-6 space-y-8">
          <ProductAnalyticsCard />
          <AppearanceCard />
        </section>
        <section id="security" aria-labelledby="security-heading" className="scroll-mt-6">
          <SecurityCard
            key={`security:${user?.id}`}
            {...(user?.id === undefined ? {} : { accountId: user.id })}
            {...(user?.email !== undefined ? { email: user.email } : {})}
            {...(user?.emailVerified !== undefined ? { emailVerified: user.emailVerified } : {})}
          />
        </section>
      </div>
    </div>
  );
}

function MyGroupsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-5 w-5" />
          My Groups
        </CardTitle>
        <CardDescription>
          Manage the groups you create or join, their members, and events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/groups" search={{ q: undefined, tab: undefined }}>
            My Groups
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileInformationCard({
  avatarBlobUrl,
  avatarFiles,
  avatarError,
  avatarPending,
  coverBlobUrl,
  coverFiles,
  coverError,
  coverPending,
  form,
  profileUsername,
  submittingProfile,
  userEmail,
  profileSaveError,
  onAvatarFilesChange,
  onCoverFilesChange,
  onMediaSubmit,
  onProfileSubmit,
}: {
  avatarBlobUrl: string | null;
  avatarFiles: AvatarFile[];
  avatarError: string | null;
  avatarPending: ProfileMediaOperation | null;
  coverBlobUrl: string | null;
  coverFiles: AvatarFile[];
  coverError: string | null;
  coverPending: ProfileMediaOperation | null;
  form: UseFormReturn<SettingsProfileFormInput, undefined, SettingsProfileFormValues>;
  profileUsername?: string | null;
  submittingProfile: boolean;
  userEmail?: string | null;
  profileSaveError: string | null;
  onAvatarFilesChange: (files: AvatarFile[]) => void;
  onCoverFilesChange: (files: AvatarFile[]) => void;
  onMediaSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    field: ProfileMediaField,
    operation: ProfileMediaOperation,
  ) => Promise<void>;
  onProfileSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const publicValue = form.watch("is_public");
  const isPublic = publicValue === true || publicValue === "true";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="profile-heading" className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            Profile Information
          </h2>
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
              onSubmit={(event) => void onMediaSubmit(event, "cover_url", "upload")}
            >
              <input {...contractEpochFormInputProps} />
              <input type="hidden" name="field" value="cover_url" />
              <FileInput
                accept="image/*"
                buttonLabel="Choose cover"
                label="Cover photo upload"
                name="profile_image"
                files={coverFiles}
                onFilesChange={onCoverFilesChange}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={coverFiles.length === 0 || !!coverPending}
              >
                {coverPending === "upload" ? "Uploading cover..." : "Upload Cover"}
              </Button>
            </form>
            {coverBlobUrl ? (
              <form
                action={removeProfileImageAction.url}
                method="post"
                onSubmit={(event) => void onMediaSubmit(event, "cover_url", "remove")}
              >
                <input {...contractEpochFormInputProps} />
                <input type="hidden" name="field" value="cover_url" />
                <Button type="submit" variant="ghost" disabled={!!coverPending}>
                  {coverPending === "remove" ? "Removing cover..." : "Remove Cover"}
                </Button>
              </form>
            ) : null}
            {coverPending ? (
              <p role="status">
                {coverPending === "upload" ? "Uploading cover..." : "Removing cover..."}
              </p>
            ) : null}
            {coverError ? <p role="alert">{coverError}</p> : null}
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
          <div className="min-w-0">
            <h3 className="break-words font-medium">{profileUsername || "No name set"}</h3>
            <p className="break-words text-sm text-muted-foreground">{userEmail}</p>
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
          onSubmit={(event) => void onMediaSubmit(event, "avatar_url", "upload")}
        >
          <input {...contractEpochFormInputProps} />
          <FileInput
            accept="image/*"
            buttonLabel="Upload avatar"
            label="Avatar upload"
            name="profile_image"
            files={avatarFiles}
            onFilesChange={onAvatarFilesChange}
          />
          <input type="hidden" name="field" value="avatar_url" />
          <Button
            type="submit"
            variant="outline"
            disabled={avatarFiles.length === 0 || !!avatarPending}
          >
            {avatarPending === "upload" ? "Uploading avatar..." : "Upload Avatar"}
          </Button>
        </form>
        {avatarBlobUrl ? (
          <form
            action={removeProfileImageAction.url}
            method="post"
            onSubmit={(event) => void onMediaSubmit(event, "avatar_url", "remove")}
          >
            <input {...contractEpochFormInputProps} />
            <input type="hidden" name="field" value="avatar_url" />
            <Button type="submit" variant="ghost" disabled={!!avatarPending}>
              {avatarPending === "remove" ? "Removing avatar..." : "Remove Avatar"}
            </Button>
          </form>
        ) : null}
        {avatarPending ? (
          <p role="status">
            {avatarPending === "upload" ? "Uploading avatar..." : "Removing avatar..."}
          </p>
        ) : null}
        {avatarError ? <p role="alert">{avatarError}</p> : null}
        <Form {...form}>
          <form
            action={updateSettingsProfileAction.url}
            method="post"
            onSubmit={(event) => {
              void onProfileSubmit(event);
            }}
            className="space-y-4"
          >
            <input {...contractEpochFormInputProps} />
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
            <FormDateInputField
              clearable
              control={form.control}
              description="Used for age-based training guidance."
              label="Date of Birth"
              maximumDate={new Date()}
              name="dob"
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
            <FormTimezoneField
              control={form.control}
              description="Used to interpret calendar days and scheduled training."
              label="Planning Timezone"
              name="planning_timezone"
            />
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
            {profileSaveError ? (
              <p aria-live="polite" className="text-sm text-destructive" role="alert">
                {profileSaveError}
              </p>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function AccountInformationCard({
  accountId,
  createdAt,
  email,
  emailVerified,
}: {
  accountId?: string;
  createdAt: string;
  email?: string | null;
  emailVerified?: boolean | null;
}) {
  const signOut = useFormServerFn(signOutAction, () => undefined, accountId);
  const signOutPendingRef = useRef(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (signOutPendingRef.current) return;

    // Capture before awaiting; the no-input RPC retains Start's CSRF middleware.
    void new FormData(event.currentTarget);
    signOutPendingRef.current = true;
    setSignOutPending(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (error) {
      if (isRedirect(error)) throw error;
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      signOutPendingRef.current = false;
      setSignOutPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="account-heading" className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Account Information
          </h2>
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
        <form
          action={signOutAction.url}
          method="post"
          onSubmit={(event) => void handleSignOut(event)}
        >
          <input {...contractEpochFormInputProps} />
          <LoadingButton
            disabled={signOutPending}
            loading={signOutPending}
            loadingLabel="Signing out..."
            variant="outline"
            type="submit"
          >
            Sign Out
          </LoadingButton>
        </form>
        {signOutError ? (
          <p className="text-sm text-destructive" role="alert">
            {signOutError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SecurityCard({
  accountId,
  email,
  emailVerified,
}: {
  accountId?: string;
  email?: string | null;
  emailVerified?: boolean | null;
}) {
  const passwordForm = useZodForm({
    defaultValues: { confirmPassword: "", currentPassword: "", newPassword: "" },
    schema: changePasswordFormSchema,
  });
  type SecurityOperation = "password" | "resend" | "revoke";
  const pendingRef = useRef(false);
  const [pending, setPending] = useState<SecurityOperation | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    operation: SecurityOperation;
    message: string;
  } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const changePassword = useFormServerFn(changePasswordAction, () => undefined, accountId);
  const resendVerification = useFormServerFn(
    resendVerificationFromSettingsAction,
    () => undefined,
    accountId,
  );
  const revokeOtherSessions = useFormServerFn(
    revokeOtherSessionsAction,
    () => undefined,
    accountId,
  );

  const handleSecuritySubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    operation: SecurityOperation,
  ) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const data = new FormData(event.currentTarget);
    data.set("__async", "true");
    pendingRef.current = true;
    setPending(operation);
    setActionError(null);
    setSuccess(null);
    setResendStatus(null);
    try {
      if (operation === "password") {
        if (!(await passwordForm.trigger(undefined, { shouldFocus: true }))) return;
        const result = await changePassword({ data });
        if (!result.ok) {
          setActionError({ operation, message: result.message });
          return;
        }
        passwordForm.reset();
        setSuccess("Password updated and other sessions signed out.");
      } else if (operation === "revoke") {
        const result = await revokeOtherSessions({ data });
        if (!result.ok) {
          setActionError({ operation, message: result.message });
          return;
        }
        setSuccess("Other sessions signed out.");
      } else {
        await resendVerification({ data });
        setResendStatus("If this address can receive verification, a message is on its way.");
      }
    } catch {
      setActionError({
        operation,
        message:
          operation === "password"
            ? "Password could not be updated. Check your current password and try again."
            : operation === "revoke"
              ? "Other sessions could not be signed out. Please try again."
              : "Verification could not be requested. Please try again.",
      });
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="security-heading" className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Password and sessions
          </h2>
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
            <form
              action={resendVerificationFromSettingsAction.url}
              method="post"
              onSubmit={(event) => void handleSecuritySubmit(event, "resend")}
            >
              <input {...contractEpochFormInputProps} />
              <input type="hidden" name="email" value={email} />
              <LoadingButton
                disabled={pending !== null}
                loading={pending === "resend"}
                loadingLabel="Sending..."
                type="submit"
                variant="outline"
              >
                Resend verification
              </LoadingButton>
            </form>
            {resendStatus ? (
              <p className="text-sm text-muted-foreground" role="status">
                {resendStatus}
              </p>
            ) : null}
            {actionError?.operation === "resend" ? <p role="alert">{actionError.message}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Your email address is verified.</p>
        )}

        <Form {...passwordForm}>
          <form
            action={changePasswordAction.url}
            method="post"
            className="space-y-4"
            onSubmit={(event) => void handleSecuritySubmit(event, "password")}
            aria-describedby={
              actionError?.operation === "password" ? "password-action-error" : undefined
            }
          >
            <input {...contractEpochFormInputProps} />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormTextField
                autoComplete="current-password"
                control={passwordForm.control}
                readOnly={pending !== null}
                aria-describedby={
                  actionError?.operation === "password" ? "password-action-error" : undefined
                }
                label="Current password"
                name="currentPassword"
                required
                type="password"
              />
              <FormTextField
                autoComplete="new-password"
                control={passwordForm.control}
                readOnly={pending !== null}
                label="New password"
                name="newPassword"
                required
                type="password"
              />
              <FormTextField
                autoComplete="new-password"
                control={passwordForm.control}
                readOnly={pending !== null}
                label="Confirm password"
                name="confirmPassword"
                required
                type="password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use at least 8 characters, one uppercase letter, and one number.
            </p>
            {actionError?.operation === "password" ? (
              <p id="password-action-error" className="text-sm text-destructive" role="alert">
                {actionError.message}
              </p>
            ) : null}
            <LoadingButton
              disabled={pending !== null}
              loading={pending === "password"}
              loadingLabel="Updating password..."
              type="submit"
            >
              Update password
            </LoadingButton>
          </form>
        </Form>

        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Other signed-in devices</p>
            <p className="text-sm text-muted-foreground">
              Revoke all sessions except the browser you are using now.
            </p>
          </div>
          <form
            action={revokeOtherSessionsAction.url}
            method="post"
            onSubmit={(event) => void handleSecuritySubmit(event, "revoke")}
          >
            <input {...contractEpochFormInputProps} />
            {actionError?.operation === "revoke" ? (
              <p className="mb-2 text-sm text-destructive" role="alert">
                {actionError.message}
              </p>
            ) : null}
            <LoadingButton
              disabled={pending !== null}
              loading={pending === "revoke"}
              loadingLabel="Signing out other sessions..."
              type="submit"
              variant="outline"
            >
              Sign out other sessions
            </LoadingButton>
          </form>
        </div>
        {success ? <p role="status">{success}</p> : null}
      </CardContent>
    </Card>
  );
}
