import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import { FormIntegerStepperField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control } from "react-hook-form";
import { View } from "react-native";

const activityCategoryOverrideOptions = [
  { key: "run", label: "Run" },
  { key: "bike", label: "Bike" },
  { key: "swim", label: "Swim" },
  { key: "strength", label: "Strength" },
  { key: "other", label: "Conditioning / HIIT / Other" },
] as const;

export type ActivityCategoryOverrideKey = (typeof activityCategoryOverrideOptions)[number]["key"];

type ScheduleValidation = {
  issues: string[];
  maxSessionsError?: string;
  maxSingleSessionError?: string;
  maxWeeklyDurationError?: string;
  minSessionsError?: string;
};

type ScheduleSectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
  doseLimits: AthleteTrainingSettingsFormInput["dose_limits"];
  onToggleActivityCategoryDoseOverride: (activity_category: ActivityCategoryOverrideKey) => void;
  scheduleValidation: ScheduleValidation;
};

export function ScheduleSection({
  control,
  doseLimits,
  onToggleActivityCategoryDoseOverride,
  scheduleValidation,
}: ScheduleSectionProps) {
  return (
    <>
      {scheduleValidation.issues.length > 0 ? (
        <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-sm font-medium text-destructive">
            Fix these schedule conflicts before saving.
          </Text>
          <Text className="mt-1 text-xs text-destructive">
            {scheduleValidation.issues.join(" ")}
          </Text>
        </View>
      ) : null}
      <FormIntegerStepperField
        control={control}
        label="Fewest sessions per week"
        max={14}
        min={0}
        name="dose_limits.min_sessions_per_week"
        testId="preferences-min-sessions"
      />
      {scheduleValidation.minSessionsError ? (
        <Text className="-mt-3 text-sm font-medium text-destructive">
          {scheduleValidation.minSessionsError}
        </Text>
      ) : null}
      <FormIntegerStepperField
        control={control}
        label="Most sessions per week"
        max={21}
        min={0}
        name="dose_limits.max_sessions_per_week"
        testId="preferences-max-sessions"
      />
      {scheduleValidation.maxSessionsError ? (
        <Text className="-mt-3 text-sm font-medium text-destructive">
          {scheduleValidation.maxSessionsError}
        </Text>
      ) : null}
      <FormIntegerStepperField
        control={control}
        label="Longest activity (minutes)"
        max={600}
        min={20}
        name="dose_limits.max_single_session_duration_minutes"
        testId="preferences-max-duration"
      />
      {scheduleValidation.maxSingleSessionError ? (
        <Text className="-mt-3 text-sm font-medium text-destructive">
          {scheduleValidation.maxSingleSessionError}
        </Text>
      ) : null}
      <FormIntegerStepperField
        control={control}
        label="Weekly time budget (minutes)"
        max={10080}
        min={30}
        name="dose_limits.max_weekly_duration_minutes"
        testId="preferences-max-weekly-duration"
      />
      {scheduleValidation.maxWeeklyDurationError ? (
        <Text className="-mt-3 text-sm font-medium text-destructive">
          {scheduleValidation.maxWeeklyDurationError}
        </Text>
      ) : null}
      <View className="mt-2 gap-3 border-t border-border pt-3">
        <View className="gap-1">
          <Text className="text-sm font-semibold text-foreground">
            ActivityCategory-specific dose overrides
          </Text>
          <Text className="text-xs leading-4 text-muted-foreground">
            Tune weekly session and duration limits for run, bike, swim, strength, conditioning,
            HIIT, or other training categories.
          </Text>
        </View>
        <View className="gap-3" testID="preferences-activity_category-overrides">
          {activityCategoryOverrideOptions.map((activity_category) => {
            const enabled = Boolean(
              doseLimits.activity_category_overrides?.[activity_category.key],
            );
            return (
              <View
                key={activity_category.key}
                className="gap-2 rounded-xl border border-border bg-background px-3 py-2"
                testID={`preferences-activity_category-override-${activity_category.key}`}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm font-medium text-foreground">
                    {activity_category.label}
                  </Text>
                  <Button
                    accessibilityLabel={`${enabled ? "Disable" : "Enable"} ${activity_category.label} dose override`}
                    onPress={() => onToggleActivityCategoryDoseOverride(activity_category.key)}
                    size="sm"
                    testID={`preferences-activity_category-override-toggle-${activity_category.key}`}
                    variant={enabled ? "default" : "outline"}
                  >
                    <Text>{enabled ? "Enabled" : "Use global"}</Text>
                  </Button>
                </View>
                {enabled ? (
                  <View className="gap-2">
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <FormIntegerStepperField
                          control={control}
                          label="Min sessions"
                          max={21}
                          min={0}
                          name={`dose_limits.activity_category_overrides.${activity_category.key}.min_sessions_per_week`}
                          testId={`preferences-activity_category-override-${activity_category.key}-min-sessions`}
                        />
                      </View>
                      <View className="flex-1">
                        <FormIntegerStepperField
                          control={control}
                          label="Max sessions"
                          max={21}
                          min={0}
                          name={`dose_limits.activity_category_overrides.${activity_category.key}.max_sessions_per_week`}
                          testId={`preferences-activity_category-override-${activity_category.key}-max-sessions`}
                        />
                      </View>
                    </View>
                    <FormIntegerStepperField
                      control={control}
                      label="Max session duration"
                      max={600}
                      min={20}
                      name={`dose_limits.activity_category_overrides.${activity_category.key}.max_single_session_duration_minutes`}
                      testId={`preferences-activity_category-override-${activity_category.key}-max-duration`}
                    />
                    <FormIntegerStepperField
                      control={control}
                      label="Max weekly duration"
                      max={10080}
                      min={30}
                      name={`dose_limits.activity_category_overrides.${activity_category.key}.max_weekly_duration_minutes`}
                      testId={`preferences-activity_category-override-${activity_category.key}-max-weekly-duration`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </>
  );
}

export function ActivityCategoryDoseOverridesSection({
  control,
  doseLimits,
  onToggleActivityCategoryDoseOverride,
}: Pick<ScheduleSectionProps, "control" | "doseLimits" | "onToggleActivityCategoryDoseOverride">) {
  return (
    <View className="mt-2 gap-3 border-t border-border pt-3">
      <Text className="text-sm font-semibold text-foreground">
        ActivityCategory-specific dose overrides
      </Text>
      <View className="gap-3" testID="preferences-activity_category-overrides">
        {activityCategoryOverrideOptions.map((activity_category) => {
          const enabled = Boolean(doseLimits.activity_category_overrides?.[activity_category.key]);

          return (
            <View
              key={activity_category.key}
              className="gap-2 rounded-xl border border-border bg-background px-3 py-2"
              testID={`preferences-activity_category-override-${activity_category.key}`}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-medium text-foreground">
                  {activity_category.label}
                </Text>
                <Button
                  accessibilityLabel={`${enabled ? "Disable" : "Enable"} ${activity_category.label} dose override`}
                  onPress={() => onToggleActivityCategoryDoseOverride(activity_category.key)}
                  size="sm"
                  testID={`preferences-activity_category-override-toggle-${activity_category.key}`}
                  variant={enabled ? "default" : "outline"}
                >
                  <Text>{enabled ? "Enabled" : "Use global"}</Text>
                </Button>
              </View>
              {enabled ? (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <FormIntegerStepperField
                        control={control}
                        label="Min sessions"
                        max={21}
                        min={0}
                        name={`dose_limits.activity_category_overrides.${activity_category.key}.min_sessions_per_week`}
                        testId={`preferences-activity_category-override-${activity_category.key}-min-sessions`}
                      />
                    </View>
                    <View className="flex-1">
                      <FormIntegerStepperField
                        control={control}
                        label="Max sessions"
                        max={21}
                        min={0}
                        name={`dose_limits.activity_category_overrides.${activity_category.key}.max_sessions_per_week`}
                        testId={`preferences-activity_category-override-${activity_category.key}-max-sessions`}
                      />
                    </View>
                  </View>
                  <FormIntegerStepperField
                    control={control}
                    label="Max session duration"
                    max={600}
                    min={20}
                    name={`dose_limits.activity_category_overrides.${activity_category.key}.max_single_session_duration_minutes`}
                    testId={`preferences-activity_category-override-${activity_category.key}-max-duration`}
                  />
                  <FormIntegerStepperField
                    control={control}
                    label="Max weekly duration"
                    max={10080}
                    min={30}
                    name={`dose_limits.activity_category_overrides.${activity_category.key}.max_weekly_duration_minutes`}
                    testId={`preferences-activity_category-override-${activity_category.key}-max-weekly-duration`}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
