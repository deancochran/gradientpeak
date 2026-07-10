import { Button } from "@repo/ui/components/button";
import { Form, FormTextField } from "@repo/ui/components/form";
import { SettingItem, SettingsGroup } from "@repo/ui/components/settings-group";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { ProfileGroupsSection } from "@/components/profile/ProfileGroupsSection";
import { ProfileSummaryCard } from "@/components/profile/ProfileSummaryCard";
import { AppHeader } from "@/components/shared";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { usePerformanceScreenReady } from "@/lib/performance";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";

const contentLinks = [
  {
    label: "My Goals",
    description: "Personal targets, goal readiness, and event milestones.",
    buttonLabel: "Open",
    route: ROUTES.GOALS.LIST,
    testID: "profile-tab-goals",
  },
  {
    label: "Activities",
    description: "Completed activity history and imported sessions.",
    buttonLabel: "Open",
    route: ROUTES.ACTIVITIES.LIST,
    testID: "profile-tab-activities",
  },
  {
    label: "Activity Plans",
    description: "Reusable activities, routes, and planned session templates.",
    buttonLabel: "Open",
    route: ROUTES.PLAN.ACTIVITY_PLAN_LIST,
    testID: "profile-tab-activity-plans",
  },
  {
    label: "Training Plans",
    description: "Structured programs and scheduled plan templates.",
    buttonLabel: "Open",
    route: ROUTES.PLAN.TRAINING_PLAN.LIST,
    testID: "profile-tab-training-plans",
  },
  {
    label: "Routes",
    description: "Saved course library and GPS route uploads.",
    buttonLabel: "Open",
    route: ROUTES.ROUTES.LIST,
    testID: "profile-tab-routes",
  },
] as const;

const updateEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter a new email address")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"),
});

const updatePasswordSchema = z
  .object({
    confirmPassword: z.string(),
    currentPassword: z.string().refine((value) => value.trim().length > 0, {
      message: "Please enter your current password",
    }),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
  })
  .superRefine(({ confirmPassword, currentPassword, newPassword }, context) => {
    if (newPassword !== confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New passwords do not match",
        path: ["confirmPassword"],
      });
    }

    if (currentPassword === newPassword && newPassword === confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password must be different from current password",
        path: ["newPassword"],
      });
    }
  });

type UpdateEmailFormData = z.infer<typeof updateEmailSchema>;
type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>;

function getValidationErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

export default function ProfileTabScreen() {
  const navigateTo = useAppNavigate();
  usePerformanceScreenReady("route-profile");
  const {
    user,
    profile,
    updateEmail,
    updatePassword,
    deleteAccount,
    canUpdateEmail,
    updateEmailUnavailableReason,
  } = useAuth();
  const authStore = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [passwordFormVisible, setPasswordFormVisible] = useState(false);
  const emailForm = useZodForm({
    schema: updateEmailSchema,
    defaultValues: { email: "" },
  });
  const passwordForm = useZodForm({
    schema: updatePasswordSchema,
    defaultValues: {
      confirmPassword: "",
      currentPassword: "",
      newPassword: "",
    },
  });
  const { data: publicProfile } = api.profiles.getPublicById.useQuery(
    { id: user?.id ?? "" },
    { enabled: Boolean(user?.id) },
  );
  const followersCount = publicProfile?.followers_count ?? profile?.followers_count ?? 0;
  const followingCount = publicProfile?.following_count ?? profile?.following_count ?? 0;

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          void authStore.clearSession();
        },
      },
    ]);
  };

  const emailSubmitForm = useZodFormSubmit<UpdateEmailFormData>({
    form: emailForm,
    shouldRethrow: false,
    onSubmit: async ({ email }) => {
      try {
        await updateEmail({ newEmail: email });
        Alert.alert(
          "Verification Sent",
          `We sent email change instructions for ${email}. Follow the link in your inbox to complete the update.`,
        );
        setEmailFormVisible(false);
        emailForm.reset();
      } catch (error) {
        Alert.alert("Error", error instanceof Error ? error.message : "Failed to update email");
      }
    },
    onValidationError: (errors) => {
      Alert.alert(
        "Error",
        getValidationErrorMessage(errors.email, "Please enter a valid email address"),
      );
    },
  });

  const passwordSubmitForm = useZodFormSubmit<UpdatePasswordFormData>({
    form: passwordForm,
    shouldRethrow: false,
    onSubmit: async ({ currentPassword, newPassword }) => {
      try {
        await updatePassword({ currentPassword, newPassword });
        Alert.alert("Password Updated", "Your password has been successfully changed.");
        setPasswordFormVisible(false);
        passwordForm.reset();
      } catch (error) {
        Alert.alert("Error", error instanceof Error ? error.message : "Failed to update password");
      }
    },
    onValidationError: (errors) => {
      Alert.alert(
        "Error",
        getValidationErrorMessage(
          errors.currentPassword,
          getValidationErrorMessage(
            errors.newPassword,
            getValidationErrorMessage(errors.confirmPassword, "Please check your password details"),
          ),
        ),
      );
    },
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteAccount().catch((error: unknown) => {
              Alert.alert(
                "Error",
                error instanceof Error ? error.message : "Failed to delete account",
              );
            });
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-background" testID="profile-tab-screen">
      <AppHeader title="Profile" />
      <ScrollView contentContainerClassName="gap-6 p-6 pb-10" showsVerticalScrollIndicator={false}>
        <ProfileSummaryCard
          emailFallback={user?.email}
          isOwnProfile
          onEdit={() => navigateTo(ROUTES.PROFILE_EDIT as any)}
          onFollowersPress={
            user?.id ? () => navigateTo(`/followers?userId=${user.id}` as any) : undefined
          }
          onFollowingPress={
            user?.id ? () => navigateTo(`/following?userId=${user.id}` as any) : undefined
          }
          onProfilePress={() => navigateTo(ROUTES.PROFILE_SETTINGS as any)}
          profile={{
            ...profile,
            followers_count: followersCount,
            following_count: followingCount,
          }}
          supportingText="Manage your account, content library, and profile settings."
          testID="profile-tab-summary"
        />

        {user?.id ? <ProfileGroupsSection profileId={user.id} testID="profile-tab-groups" /> : null}

        <SettingsGroup
          title="Metric Surfaces"
          description="Open measurements grouped by profile metric type or activity effort type."
          testID="profile-tab-metric-entries"
        >
          <SettingItem
            type="button"
            label="Profile Metrics"
            description="Weight, HRV, sleep, threshold, and other profile measurements by type."
            buttonLabel="Manage"
            variant="outline"
            onPress={() => navigateTo(ROUTES.PROFILE_METRICS.LIST as any)}
            testID="profile-tab-profile-metrics"
          />
          <SettingItem
            type="button"
            label="Activity Efforts"
            description="Best power and speed efforts grouped by activity and measurement type."
            buttonLabel="Manage"
            variant="outline"
            onPress={() => navigateTo(ROUTES.ACTIVITIES.EFFORTS_LIST as any)}
            testID="profile-tab-activity-efforts"
          />
        </SettingsGroup>

        <SettingsGroup
          title="Training Library"
          description="Open saved plans, routes, activities, and completed activity history."
          testID="profile-tab-library"
        >
          {contentLinks.map((link) => (
            <SettingItem
              key={link.testID}
              type="button"
              label={link.label}
              description={link.description}
              buttonLabel={link.buttonLabel}
              variant="outline"
              onPress={() => navigateTo(link.route as any)}
              testID={link.testID}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup
          title="Settings"
          description="Manage training preferences, integrations, and account access."
          testID="profile-tab-settings"
        >
          <SettingItem
            type="button"
            label="Integrations"
            description="Connect third-party services like Strava and Garmin."
            buttonLabel="Manage"
            variant="outline"
            onPress={() => navigateTo(ROUTES.INTEGRATIONS as any)}
            testID="profile-tab-integrations"
          />
          <SettingItem
            type="toggle"
            label="Dark Mode"
            description="Use the dark app appearance."
            value={resolvedTheme === "dark"}
            onValueChange={(enabled) => setTheme(enabled ? "dark" : "light")}
            testID="profile-tab-dark-mode"
          />
          <SettingItem
            type="button"
            label="Email"
            description={user?.email || "Not set"}
            buttonLabel={canUpdateEmail ? "Change" : "Unavailable"}
            variant="outline"
            onPress={() => {
              if (canUpdateEmail) {
                setEmailFormVisible((value) => !value);
                return;
              }
              Alert.alert(
                "Temporarily unavailable",
                updateEmailUnavailableReason ?? "Email changes are currently unavailable.",
              );
            }}
            disabled={!canUpdateEmail}
            testID="profile-tab-update-email"
          />
          {emailFormVisible ? (
            <View className="mb-4 gap-3 rounded-2xl border border-border bg-card p-4">
              <Text className="text-sm font-medium text-foreground">Update Email Address</Text>
              <Form {...emailForm}>
                <FormTextField
                  control={emailForm.control}
                  label="New email address"
                  name="email"
                  placeholder="New email address"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  testId="profile-tab-email-input"
                />
              </Form>
              <Button
                disabled={emailSubmitForm.isSubmitting}
                onPress={emailSubmitForm.handleSubmit}
                testID="profile-tab-email-submit-button"
              >
                <Text className="text-sm font-medium text-primary-foreground">
                  Send Verification Email
                </Text>
              </Button>
            </View>
          ) : null}
          <SettingItem
            type="button"
            label="Password"
            description="Change your password"
            buttonLabel={passwordFormVisible ? "Cancel" : "Change"}
            variant="outline"
            onPress={() => setPasswordFormVisible((value) => !value)}
            testID="profile-tab-change-password"
          />
          {passwordFormVisible ? (
            <View className="mb-4 gap-3 rounded-2xl border border-border bg-card p-4">
              <Text className="text-sm font-medium text-foreground">Change Your Password</Text>
              <Form {...passwordForm}>
                <View className="gap-3">
                  <FormTextField
                    control={passwordForm.control}
                    label="Current password"
                    name="currentPassword"
                    placeholder="Current password"
                    secureTextEntry
                    autoCapitalize="none"
                    testId="profile-tab-current-password-input"
                  />
                  <FormTextField
                    control={passwordForm.control}
                    label="New password"
                    name="newPassword"
                    placeholder="New password"
                    secureTextEntry
                    autoCapitalize="none"
                    testId="profile-tab-new-password-input"
                  />
                  <FormTextField
                    control={passwordForm.control}
                    label="Confirm new password"
                    name="confirmPassword"
                    placeholder="Confirm new password"
                    secureTextEntry
                    autoCapitalize="none"
                    testId="profile-tab-confirm-password-input"
                  />
                </View>
              </Form>
              <Button
                disabled={passwordSubmitForm.isSubmitting}
                onPress={passwordSubmitForm.handleSubmit}
                testID="profile-tab-password-submit-button"
              >
                <Text className="text-sm font-medium text-primary-foreground">Update Password</Text>
              </Button>
            </View>
          ) : null}
          <SettingItem
            type="button"
            label="Sign Out"
            description="Sign out of this device."
            buttonLabel="Sign Out"
            variant="destructive"
            onPress={handleSignOut}
            testID="profile-tab-sign-out"
          />
          <SettingItem
            type="button"
            label="Delete Account"
            description="Permanently delete your account and all data."
            buttonLabel="Delete"
            variant="destructive"
            onPress={handleDeleteAccount}
            testID="profile-tab-delete-account"
          />
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}
