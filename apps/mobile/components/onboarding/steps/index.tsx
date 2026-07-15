import {
  createEmptyGoalDraft,
  estimateConservativeFTPFromWeight,
  estimateMaxHRFromDOB,
  formatWeightForDisplay,
  getGoalDraftQualityFeedback,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Activity, Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { z } from "zod";
import {
  type AthleteBaselineChange,
  type AthleteBaselineFieldSources,
  AthleteBaselineFields,
} from "@/components/athlete-baseline";
import { GoalEditorForm } from "@/components/goals";
import { IntegrationProviderList } from "@/components/integrations/IntegrationProviderList";
import { applyCompactTrainingPreferencesChange } from "@/components/settings/training-preferences/compactTrainingPreferences";
import { TrainingPreferencesSurface } from "@/components/settings/training-preferences/TrainingPreferencesSurface";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { isValidOnboardingUsername } from "@/lib/onboarding/validation";
import {
  getCompactTrainingPreferencesValue,
  getTrainingPreferencesSummary,
  PRIMARY_SPORT_OPTIONS,
} from "../onboarding-data";
import type { IntegrationProvider, OnboardingData, StepProps } from "../types";

export { GroupsAndPeopleStep } from "./GroupsAndPeopleStep";

const INTENT_OPTIONS: Array<{
  value: OnboardingData["intent"][number];
  label: string;
  description: string;
}> = [
  {
    value: "train_event",
    label: "Train for an event",
    description: "Build toward a race or target date.",
  },
  {
    value: "improve_fitness",
    label: "Improve fitness",
    description: "Get stronger, faster, or more consistent.",
  },
  {
    value: "track_activities",
    label: "Track activities",
    description: "Record and understand your training.",
  },
  {
    value: "groups",
    label: "Train with groups",
    description: "Join communities, teams, or clubs.",
  },
  {
    value: "follow_people",
    label: "Follow athletes",
    description: "Keep up with friends, teammates, or coaches.",
  },
  {
    value: "coach_group",
    label: "Coach or manage",
    description: "Organize athletes, groups, or events.",
  },
  {
    value: "explore",
    label: "Just exploring",
    description: "Set up the basics and decide later.",
  },
];

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xl font-semibold text-foreground">{title}</Text>
      {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
    </View>
  );
}

const identityStepSchema = z.object({
  full_name: z
    .string()
    .refine((value) => value.trim().length <= 50, "Full name must be 50 characters or less"),
  username: z
    .string()
    .refine(
      (value) => value.length === 0 || isValidOnboardingUsername(value),
      "Username must be 3-30 letters, numbers, or underscores",
    ),
});

type IdentityStepForm = z.infer<typeof identityStepSchema>;

export const IntroStep = () => (
  <View className="items-center justify-center flex-1 py-8">
    <View className="w-24 h-24 bg-primary/10 rounded-full items-center justify-center mb-6">
      <Icon as={Activity} size={48} className="text-primary" />
    </View>
    <Text className="text-2xl font-bold text-center mb-2">Welcome to GradientPeak</Text>
    <Text className="text-center text-muted-foreground px-4">
      Let&apos;s customize your experience. This will only take a minute.
    </Text>
  </View>
);

export const IdentityStep = ({ data, updateData, usernameAvailability }: StepProps) => {
  const form = useZodForm({
    schema: identityStepSchema,
    defaultValues: {
      full_name: data.full_name,
      username: data.username,
    },
    mode: "onChange",
  });
  const fullName = form.watch("full_name");
  const username = form.watch("username");
  const lastSyncedValues = useRef<IdentityStepForm>({
    full_name: data.full_name,
    username: data.username,
  });
  const isSyncingFromParent = useRef(false);

  useEffect(() => {
    const values = { full_name: data.full_name, username: data.username };

    if (
      values.full_name !== lastSyncedValues.current.full_name ||
      values.username !== lastSyncedValues.current.username
    ) {
      isSyncingFromParent.current = true;
      lastSyncedValues.current = values;
      form.reset(values);
    }
  }, [data.full_name, data.username, form]);

  useEffect(() => {
    if (isSyncingFromParent.current) {
      isSyncingFromParent.current = false;
      return;
    }

    const values = { full_name: fullName, username };

    if (
      values.full_name !== lastSyncedValues.current.full_name ||
      values.username !== lastSyncedValues.current.username
    ) {
      lastSyncedValues.current = values;
      updateData(values);
    }
  }, [fullName, updateData, username]);

  useEffect(() => {
    const trimmedUsername = username.trim();

    if (isValidOnboardingUsername(trimmedUsername) && usernameAvailability?.available === false) {
      form.setError("username", { message: "That username is already taken", type: "manual" });
    } else if (isValidOnboardingUsername(trimmedUsername)) {
      form.clearErrors("username");
    }
  }, [form, username, usernameAvailability?.available]);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="text-xl font-semibold text-foreground">Set up your profile</Text>
        <Text className="text-sm text-muted-foreground">
          Add the identity other athletes will see in GradientPeak.
        </Text>
      </View>

      <Form {...form}>
        <View className="gap-4">
          <FormTextField
            control={form.control}
            label="Full name"
            name="full_name"
            placeholder="Enter full name"
            required
            testId="onboarding-full-name-input"
          />

          <View className="gap-2">
            <FormTextField
              control={form.control}
              autoCapitalize="none"
              label="Username"
              name="username"
              placeholder="Enter username"
              required
              testId="onboarding-username-input"
            />
            {usernameAvailability?.isChecking ? (
              <ActivityIndicator
                accessibilityLabel="Checking username"
                className="self-start text-muted-foreground"
                size="small"
                testID="onboarding-username-checking"
              />
            ) : usernameAvailability?.isError ? (
              <Text className="text-xs text-destructive" testID="onboarding-username-error">
                Username availability could not be checked. Try again.
              </Text>
            ) : usernameAvailability?.available === true ? (
              <Text className="text-xs text-success" testID="onboarding-username-available">
                Username is available
              </Text>
            ) : usernameAvailability?.available === false ? (
              <Text className="text-xs text-destructive" testID="onboarding-username-unavailable">
                That username is already taken
              </Text>
            ) : null}
          </View>
        </View>
      </Form>
    </View>
  );
};

export const SportStep = ({ data, updateData }: StepProps) => {
  const toggleSport = (sport: OnboardingData["sport_interests"][number]) => {
    const hasSport = data.sport_interests.includes(sport);
    updateData({
      sport_interests: hasSport
        ? data.sport_interests.filter((item) => item !== sport)
        : [...data.sport_interests, sport],
    });
  };

  return (
    <View className="gap-3">
      <SectionHeading
        title="Sports you care about"
        description="Choose any that fit. We use these to show only relevant setup fields."
      />
      {PRIMARY_SPORT_OPTIONS.map((sport) => {
        const selected = data.sport_interests.includes(sport);

        return (
          <TouchableOpacity
            key={sport}
            onPress={() => toggleSport(sport)}
            testID={`onboarding-sport-${sport}`}
            className={`p-4 border rounded-xl flex-row items-center justify-between ${
              selected ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <Text className="font-semibold capitalize text-lg text-foreground">{sport}</Text>
            {selected && <Icon as={Check} className="text-primary" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

function IntentStep({ data, updateData }: StepProps) {
  return (
    <View className="gap-3">
      <SectionHeading
        title="What brings you here?"
        description="Choose all that apply for personalization."
      />
      {INTENT_OPTIONS.map((option) => {
        const isSelected = data.intent.includes(option.value);

        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            onPress={() =>
              updateData({
                intent: isSelected
                  ? data.intent.filter((intent) => intent !== option.value)
                  : [...data.intent, option.value],
              })
            }
            testID={`onboarding-intent-${option.value}`}
            className={`p-4 border rounded-xl flex-row items-center justify-between ${
              isSelected ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <View className="flex-1 pr-3">
              <Text className="font-semibold text-base text-foreground">{option.label}</Text>
              <Text className="text-sm text-muted-foreground">{option.description}</Text>
            </View>
            {isSelected && <Icon as={Check} className="text-primary" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const ProfileAndIntentStep = (props: StepProps) => (
  <View className="gap-8">
    <IdentityStep {...props} />
    <IntentStep {...props} />
    <SportStep {...props} />
  </View>
);

export const IntegrationsStep = ({ onRefreshIntegrations }: StepProps) => {
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );
  const [pendingProvider, setPendingProvider] = useState<IntegrationProvider | null>(null);
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation();
  const {
    data: syncOverview,
    error: syncOverviewError,
    isLoading,
    refetch: refetchSyncOverview,
  } = api.integrations.getSyncOverview.useQuery(undefined);

  const handleConnect = async (providerKey: IntegrationProvider) => {
    setPendingProvider(providerKey);
    try {
      const redirectUri = getMobileRedirectUri();
      const { url } = await getAuthUrlMutation.mutateAsync({
        provider: providerKey,
        redirectUri,
      });

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

      if (result.type === "success") {
        await refetchSyncOverview();
        onRefreshIntegrations?.();
        setStatusModal({ title: "Success", description: "Integration connected." });
      }
    } catch (error) {
      console.error(error);
      setStatusModal({ title: "Error", description: "Failed to connect integration." });
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Connect Accounts</Text>
      <Text className="text-muted-foreground mb-4">Sync your activities automatically.</Text>

      <IntegrationProviderList
        error={syncOverviewError}
        integrations={syncOverview ?? []}
        isLoading={isLoading}
        onConnect={(provider) => {
          void handleConnect(provider);
        }}
        pendingByProvider={pendingProvider ? { [pendingProvider]: "connect" } : {}}
        onRetry={refetchSyncOverview}
      />
      {statusModal ? (
        <AppConfirmModal
          description={statusModal.description}
          onClose={() => setStatusModal(null)}
          primaryAction={{
            label: "OK",
            onPress: () => setStatusModal(null),
            testID: "onboarding-integrations-status-confirm",
          }}
          testID="onboarding-integrations-status-modal"
          title={statusModal.title}
        />
      ) : null}
    </View>
  );
};

export const ProviderSyncStep = ({
  providerSyncStatus,
  onRetryProviderSync,
  onClearProviderRequirement,
}: StepProps) => {
  const status = providerSyncStatus?.status ?? "idle";
  const isRecoverable = status === "failed" || status === "timed_out";

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Syncing connected accounts</Text>
      <Text className="text-muted-foreground mb-2">
        We&apos;re importing setup fields from connected services before showing the manual review
        steps.
      </Text>

      <Card>
        <CardContent className="pt-6 gap-3">
          {(providerSyncStatus?.providers ?? []).map((provider) => (
            <View key={provider.provider} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold capitalize text-foreground">
                  {provider.provider}
                </Text>
                <Text className="text-sm text-muted-foreground capitalize">
                  {provider.status.replace(/_/g, " ")}
                </Text>
              </View>
              {provider.message ? (
                <Text className="text-xs text-muted-foreground">{provider.message}</Text>
              ) : null}
              {(provider.status === "failed" || provider.status === "timed_out") &&
              provider.blocking ? (
                <Button
                  variant="outline"
                  onPress={() => onClearProviderRequirement?.(provider.provider)}
                  testID={`onboarding-clear-${provider.provider}-requirement`}
                >
                  <Text>Remove from onboarding</Text>
                </Button>
              ) : null}
            </View>
          ))}
        </CardContent>
      </Card>

      {isRecoverable ? (
        <Button
          variant="outline"
          onPress={onRetryProviderSync}
          testID="onboarding-provider-sync-retry"
        >
          <Text>Retry sync</Text>
        </Button>
      ) : null}
    </View>
  );
};

export const ConnectAndImportStep = (props: StepProps) => {
  const hasProviderSync = props.providerSyncStatus && props.providerSyncStatus.status !== "idle";

  return (
    <View className="gap-8">
      <IntegrationsStep {...props} />
      {hasProviderSync ? <ProviderSyncStep {...props} /> : null}
    </View>
  );
};

export const TrainingBaselineStep = ({ data, fieldSources, updateData }: StepProps) => {
  const baselineSources: AthleteBaselineFieldSources = {
    experience: fieldSources?.experience_level,
    dob: fieldSources?.dob,
    gender: fieldSources?.gender,
    weightKg: fieldSources?.weight_kg,
    weightDisplayUnit: fieldSources?.weight_unit,
    maxHr: fieldSources?.max_hr,
    restingHr: fieldSources?.resting_hr,
    ftp: fieldSources?.ftp,
    thresholdPaceSecondsPerKm: fieldSources?.threshold_pace,
    cssSecondsPer100m: fieldSources?.css,
  };

  const handleBaselineChange = (change: AthleteBaselineChange) => {
    const options = {
      source: change.source === "estimated" ? ("estimated" as const) : ("user" as const),
    };

    switch (change.field) {
      case "experience":
        updateData({ experience_level: change.value }, options);
        break;
      case "dob":
        updateData({ dob: change.value }, options);
        break;
      case "gender":
        updateData({ gender: change.value }, options);
        break;
      case "weightKg":
        updateData({ weight_kg: change.value }, options);
        break;
      case "weightDisplayUnit":
        updateData({ weight_unit: change.value }, options);
        break;
      case "maxHr":
        updateData({ max_hr: change.value }, options);
        break;
      case "restingHr":
        updateData({ resting_hr: change.value }, options);
        break;
      case "ftp":
        updateData({ ftp: change.value }, options);
        break;
      case "thresholdPaceSecondsPerKm":
        updateData({ threshold_pace: change.value }, options);
        break;
      case "cssSecondsPer100m":
        updateData({ css: change.value }, options);
        break;
    }
  };

  return (
    <View className="gap-3">
      <SectionHeading
        title="Training baseline"
        description="Review imported or estimated values. Every field is optional; metrics can be excluded from this setup."
      />
      <AthleteBaselineFields
        value={{
          experience: data.experience_level,
          dob: data.dob,
          gender: data.gender,
          weightKg: data.weight_kg,
          weightDisplayUnit: data.weight_unit,
          maxHr: data.max_hr,
          restingHr: data.resting_hr,
          ftp: data.ftp,
          thresholdPaceSecondsPerKm: data.threshold_pace,
          cssSecondsPer100m: data.css,
        }}
        onChange={handleBaselineChange}
        visibleSports={data.sport_interests.filter(
          (sport): sport is "cycling" | "running" | "swimming" =>
            sport === "cycling" || sport === "running" || sport === "swimming",
        )}
        sources={baselineSources}
        estimates={{
          maxHr: estimateMaxHRFromDOB(data.dob),
          ftp: estimateConservativeFTPFromWeight(data.weight_kg),
        }}
      />
      <Text className="text-xs text-muted-foreground">
        Excluding a metric means it is not used for this setup. Existing historical observations
        remain available and require a separate evidence-management action to remove.
      </Text>
    </View>
  );
};

export const GoalsPreferencesStep = ({ data, updateData }: StepProps) => {
  const initialGoalDraftRef = useRef(data.goal_draft ?? createEmptyGoalDraft());
  const goalFeedback = data.goal_draft
    ? getGoalDraftQualityFeedback({ draft: data.goal_draft })
    : null;

  const handlePreferencesChange = (
    change: Parameters<typeof applyCompactTrainingPreferencesChange>[1],
  ) => {
    if (data.training_preferences_hydration_status !== "ready") {
      return;
    }

    try {
      const patch = { ...data.training_preferences_patch, ...change };
      const trainingSettings = applyCompactTrainingPreferencesChange(data.training_settings, patch);
      updateData({
        compact_training_preferences: getCompactTrainingPreferencesValue(trainingSettings),
        should_save_training_preferences: true,
        training_settings: trainingSettings,
        training_preferences_patch: patch,
        training_preferences_error: null,
      });
    } catch (error) {
      updateData({
        training_preferences_error:
          error instanceof Error ? error.message : "Review these optional training preferences.",
      });
    }
  };

  const addGoal = () => {
    const goalDraft = createEmptyGoalDraft();
    initialGoalDraftRef.current = goalDraft;
    updateData({ goal_draft: goalDraft, should_create_goal: true });
  };

  return (
    <View className="gap-8">
      <View className="gap-3">
        <SectionHeading
          title="Training preferences"
          description="Choose a starting approach and weekly dose. You can fine-tune advanced settings later."
        />
        <View
          accessibilityState={{
            disabled: data.training_preferences_hydration_status !== "ready",
          }}
          pointerEvents={data.training_preferences_hydration_status === "ready" ? "auto" : "none"}
          testID="onboarding-training-preferences-controls"
        >
          <TrainingPreferencesSurface
            presentation="compact"
            value={data.compact_training_preferences}
            onChange={handlePreferencesChange}
          />
        </View>
        {data.training_preferences_hydration_status === "loading" ? (
          <Text className="text-sm text-muted-foreground" testID="onboarding-preferences-loading">
            Loading your current training preferences…
          </Text>
        ) : null}
        {data.training_preferences_hydration_status === "error" ? (
          <Text className="text-sm text-destructive" testID="onboarding-preferences-query-error">
            Training preferences are unavailable and will be skipped. You can still add a goal and
            continue.
          </Text>
        ) : null}
        {data.training_preferences_error ? (
          <Text
            className="text-sm text-destructive"
            testID="onboarding-training-preferences-feedback"
          >
            {data.training_preferences_error} That change was not applied. Skip keeps your existing
            training preferences unchanged.
          </Text>
        ) : null}
      </View>

      <View className="gap-3">
        <SectionHeading
          title="Goal (optional)"
          description="Add one plan-ready goal now, or skip it and create one later."
        />
        {!data.should_create_goal ? (
          <Button onPress={addGoal} testID="onboarding-add-goal" variant="outline">
            <Text>Add a goal</Text>
          </Button>
        ) : (
          <View className="gap-3">
            <Button
              onPress={() => updateData({ goal_draft: null, should_create_goal: false })}
              testID="onboarding-remove-goal"
              variant="ghost"
            >
              <Text className="text-muted-foreground">Remove goal</Text>
            </Button>
            <GoalEditorForm
              contentSizing="intrinsic"
              initialValue={initialGoalDraftRef.current}
              onDraftChange={(goal_draft) => updateData({ goal_draft })}
              onSubmit={() => undefined}
              showSubmitAction={false}
            />
            {goalFeedback && !goalFeedback.canGuidePlan ? (
              <Text className="text-sm text-muted-foreground" testID="onboarding-goal-feedback">
                {goalFeedback.message} An incomplete goal will be skipped and will not block setup.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
};

export const SummaryStep = ({ data }: { data: OnboardingData }) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const summaryItems = [
    { label: "Full name", value: data.full_name.trim() },
    { label: "Username", value: data.username.trim() },
    {
      label: "Intent",
      value:
        data.intent.length > 0
          ? data.intent.map((intent) => intent.replace(/_/g, " ")).join(", ")
          : null,
      capitalize: true,
    },
    { label: "Experience", value: data.experience_level, capitalize: true },
    { label: "Gender", value: data.gender, capitalize: true },
    { label: "Date of Birth", value: data.dob },
    {
      label: "Weight",
      value: data.weight_kg
        ? `${formatWeightForDisplay(data.weight_kg, data.weight_unit)} ${data.weight_unit}`
        : null,
    },
    {
      label: "Sports",
      value: data.sport_interests.length > 0 ? data.sport_interests.join(", ") : null,
      capitalize: true,
    },
    { label: "Max HR", value: data.max_hr ? `${data.max_hr} bpm` : null },
    { label: "Resting HR", value: data.resting_hr ? `${data.resting_hr} bpm` : null },
    { label: "FTP", value: data.ftp ? `${data.ftp} W` : null },
    {
      label: "Threshold Pace",
      value: data.threshold_pace ? `${formatDuration(data.threshold_pace)} /km` : null,
    },
    { label: "CSS", value: data.css ? `${formatDuration(data.css)} /100m` : null },
    {
      label: "Training preferences",
      value:
        data.training_preferences_hydration_status === "error"
          ? "Unavailable — skipped"
          : data.should_save_training_preferences
            ? getTrainingPreferencesSummary(data.training_settings)
            : "Skipped",
      capitalize: true,
    },
    {
      label: "Goal",
      value:
        data.should_create_goal && data.goal_draft
          ? getGoalDraftQualityFeedback({ draft: data.goal_draft }).canGuidePlan
            ? `Create ${data.goal_draft.title.trim()}`
            : "Skip incomplete goal"
          : "Skip",
    },
    {
      label: "Groups & people",
      value:
        [
          data.selected_invitation_ids.length
            ? `${data.selected_invitation_ids.length} invitation${data.selected_invitation_ids.length === 1 ? "" : "s"}`
            : null,
          data.selected_group_actions.length
            ? `${data.selected_group_actions.length} group${data.selected_group_actions.length === 1 ? "" : "s"}`
            : null,
          data.selected_follow_profile_ids.length
            ? `${data.selected_follow_profile_ids.length} profile${data.selected_follow_profile_ids.length === 1 ? "" : "s"} to follow`
            : null,
        ]
          .filter(Boolean)
          .join(", ") || "Skipped",
    },
  ].filter((item) => item.value !== null && item.value !== undefined);

  return (
    <View className="gap-4">
      <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center self-center mb-4">
        <Icon as={Check} size={32} className="text-green-600" />
      </View>
      <Text className="text-2xl font-bold text-center">All Set!</Text>
      <Text className="text-center text-muted-foreground mb-6">
        Here is a summary of your profile settings.
      </Text>

      <Card>
        <CardContent className="pt-6 gap-3">
          {summaryItems.map((item) => (
            <View key={item.label} className="flex-row justify-between">
              <Text className="text-muted-foreground">{item.label}</Text>
              <Text className={`font-medium ${item.capitalize ? "capitalize" : ""}`}>
                {item.value}
              </Text>
            </View>
          ))}
          {summaryItems.length === 0 && (
            <Text className="text-center text-muted-foreground italic">
              No information provided
            </Text>
          )}
        </CardContent>
      </Card>
    </View>
  );
};
