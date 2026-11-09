import {
  completeOnboardingSchema,
  createEmptyGoalDraft,
  formatWeightForDisplay,
  getGoalDraftQualityFeedback,
} from "@repo/core";
import { estimateMaxHRFromDOB } from "@repo/core/estimators";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormTextField, FormTimezoneField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { Activity, Check } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import {
  type AthleteBaselineChange,
  type AthleteBaselineFieldSources,
  AthleteBaselineFields,
} from "@/components/athlete-baseline";
import { GoalEditorForm } from "@/components/goals";
import { omitUndefined } from "@/lib/omitUndefined";
import { isValidOnboardingUsername } from "@/lib/onboarding/validation";
import { PRIMARY_ACTIVITY_CATEGORY_OPTIONS } from "../onboarding-data";
import type { OnboardingData, StepProps } from "../types";

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

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xl font-semibold text-foreground">{title}</Text>
      {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
    </View>
  );
}

const identityStepSchema = completeOnboardingSchema.pick({
  full_name: true,
  username: true,
  planning_timezone: true,
});

type IdentityStepForm = Pick<OnboardingData, "full_name" | "username" | "planning_timezone">;

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

export const IdentityStep = ({
  accountIdentity,
  data,
  updateData,
  usernameAvailability,
}: StepProps) => {
  const form = useZodForm({
    schema: identityStepSchema,
    defaultValues: {
      full_name: data.full_name,
      username: data.username,
      planning_timezone: data.planning_timezone,
    },
    mode: "onChange",
  });
  const fullName = form.watch("full_name");
  const username = form.watch("username");
  const planningTimezone = form.watch("planning_timezone") ?? null;
  // Subscribe so keepDirtyValues preserves an edited timezone on profile refresh.
  void form.formState.dirtyFields;
  const lastSyncedValues = useRef<IdentityStepForm>({
    full_name: data.full_name,
    username: data.username,
    planning_timezone: data.planning_timezone,
  });
  const isSyncingFromParent = useRef(false);
  const accountIdentityRef = useRef(accountIdentity);

  useEffect(() => {
    const values = {
      full_name: data.full_name,
      username: data.username,
      planning_timezone: data.planning_timezone,
    };
    const accountChanged = accountIdentityRef.current !== accountIdentity;
    accountIdentityRef.current = accountIdentity;

    if (
      accountChanged ||
      values.full_name !== lastSyncedValues.current.full_name ||
      values.username !== lastSyncedValues.current.username ||
      values.planning_timezone !== lastSyncedValues.current.planning_timezone
    ) {
      isSyncingFromParent.current = true;
      // Background profile refreshes may carry new untouched values, but must not
      // overwrite identity the person is actively editing.
      form.reset(values, accountChanged ? { keepDirtyValues: false } : { keepDirtyValues: true });
      lastSyncedValues.current = {
        ...form.getValues(),
        planning_timezone: form.getValues("planning_timezone") ?? null,
      };
    }
  }, [accountIdentity, data.full_name, data.username, data.planning_timezone, form]);

  useEffect(() => {
    if (isSyncingFromParent.current) {
      isSyncingFromParent.current = false;
      return;
    }

    const values = { full_name: fullName, username, planning_timezone: planningTimezone };

    if (
      values.full_name !== lastSyncedValues.current.full_name ||
      values.username !== lastSyncedValues.current.username ||
      values.planning_timezone !== lastSyncedValues.current.planning_timezone
    ) {
      const previous = lastSyncedValues.current;
      lastSyncedValues.current = values;
      updateData({
        ...(values.full_name !== previous.full_name ? { full_name: values.full_name } : {}),
        ...(values.username !== previous.username ? { username: values.username } : {}),
        ...(values.planning_timezone !== previous.planning_timezone
          ? { planning_timezone: values.planning_timezone }
          : {}),
      });
    }
  }, [fullName, updateData, username, planningTimezone]);

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
          <FormTimezoneField
            control={form.control}
            label="Planning timezone"
            name="planning_timezone"
            description="Defaults to your device timezone. Change it if you plan your training elsewhere."
            testId="onboarding-timezone"
          />
        </View>
      </Form>
    </View>
  );
};

export const ActivityCategoryStep = ({ data, updateData }: StepProps) => {
  const toggleActivityCategory = (
    activity_category: OnboardingData["activity_category_interests"][number],
  ) => {
    const hasActivityCategory = data.activity_category_interests.includes(activity_category);
    updateData({
      activity_category_interests: hasActivityCategory
        ? data.activity_category_interests.filter((item) => item !== activity_category)
        : [...data.activity_category_interests, activity_category],
    });
  };

  return (
    <View className="gap-3">
      <SectionHeading
        title="ActivityCategories you care about"
        description="Choose any that fit. We use these to show only relevant setup fields."
      />
      {PRIMARY_ACTIVITY_CATEGORY_OPTIONS.map((activity_category) => {
        const selected = data.activity_category_interests.includes(activity_category);

        return (
          <TouchableOpacity
            key={activity_category}
            onPress={() => toggleActivityCategory(activity_category)}
            testID={`onboarding-activity_category-${activity_category}`}
            className={`p-4 border rounded-xl flex-row items-center justify-between ${
              selected ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <Text className="font-semibold capitalize text-lg text-foreground">
              {activity_category}
            </Text>
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
    <ActivityCategoryStep {...props} />
  </View>
);

export const TrainingBaselineStep = ({ data, fieldSources, updateData }: StepProps) => {
  const baselineSources: AthleteBaselineFieldSources = omitUndefined({
    experience: fieldSources?.experience_level,
    dob: fieldSources?.dob,
    gender: fieldSources?.gender,
    weightKg: fieldSources?.weight_kg,
    weightDisplayUnit: fieldSources?.weight_unit,
    maxHr: fieldSources?.max_hr,
    restingHr: fieldSources?.resting_hr,
  });

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
        }}
        onChange={handleBaselineChange}
        {...omitUndefined({ sources: baselineSources })}
        estimates={{
          maxHr: estimateMaxHRFromDOB(data.dob),
        }}
      />
      <Text className="text-xs text-muted-foreground">
        Excluding a metric means it is not used for this setup. Existing historical observations
        remain available and require a separate evidence-management action to remove.
      </Text>
    </View>
  );
};

export const GoalsPreferencesStep = (props: StepProps) => (
  <AccountGoalsPreferencesStep key={props.accountIdentity ?? "anonymous"} {...props} />
);

const AccountGoalsPreferencesStep = ({ data, updateData }: StepProps) => {
  const initialGoalDraftRef = useRef(data.goal_draft ?? createEmptyGoalDraft());
  const goalFeedback = data.goal_draft
    ? getGoalDraftQualityFeedback({ draft: data.goal_draft })
    : null;

  const addGoal = useCallback(() => {
    const goalDraft = createEmptyGoalDraft();
    initialGoalDraftRef.current = goalDraft;
    updateData({ goal_draft: goalDraft, should_create_goal: true });
  }, [updateData]);

  return (
    <View className="gap-8">
      <View className="gap-3">
        <SectionHeading
          title="Initial goal (optional)"
          description="Add a goal now, or set one up later."
        />
        {!data.should_create_goal ? (
          <Button onPress={addGoal} testID="onboarding-add-goal" variant="outline">
            <Text>Add a goal</Text>
          </Button>
        ) : (
          <View className="gap-3">
            <GoalEditorForm
              contentSizing="intrinsic"
              initialValue={initialGoalDraftRef.current}
              onDraftChange={(goal_draft) => updateData({ goal_draft })}
              onSubmit={() => undefined}
              showSubmitAction={false}
            />
            <Button
              onPress={() => {
                initialGoalDraftRef.current = createEmptyGoalDraft();
                updateData({ should_create_goal: false, goal_draft: null });
              }}
              testID="onboarding-skip-goal"
              variant="ghost"
            >
              <Text>Skip goal for now</Text>
            </Button>
            {goalFeedback && !goalFeedback.canGuidePlan ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-muted-foreground"
                testID="onboarding-goal-feedback"
              >
                {goalFeedback.message} You can keep editing or skip this goal for now.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
};

export const SummaryStep = ({ data }: { data: OnboardingData }) => {
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
      label: "ActivityCategories",
      value:
        data.activity_category_interests.length > 0
          ? data.activity_category_interests.join(", ")
          : null,
      capitalize: true,
    },
    { label: "Max HR", value: data.max_hr ? `${data.max_hr} bpm` : null },
    { label: "Resting HR", value: data.resting_hr ? `${data.resting_hr} bpm` : null },
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
