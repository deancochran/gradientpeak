import { isProfileMetricValueWithinRange } from "@repo/core/athlete-inputs";
import { isValidIdentity } from "@/lib/onboarding/validation";
import {
  ConnectAndImportStep,
  GoalsPreferencesStep,
  GroupsAndPeopleStep,
  ProfileAndIntentStep,
  SummaryStep,
  TrainingBaselineStep,
} from "./steps";
import type { StepConfig } from "./types";

export function getOnboardingSteps(options: {
  providerSyncStarted: boolean;
  canContinueProviderSync: boolean;
  isUsernameAvailable: boolean;
}): StepConfig[] {
  return [
    {
      id: "profile",
      canSkip: false,
      component: ProfileAndIntentStep,
      shouldShow: () => true,
      isValid: (data) => isValidIdentity(data) && options.isUsernameAvailable,
    },
    {
      id: "connect_import",
      canSkip: true,
      component: ConnectAndImportStep,
      shouldShow: () => true,
      isValid: () => options.canContinueProviderSync,
    },
    {
      id: "training_baseline",
      canSkip: true,
      component: TrainingBaselineStep,
      shouldShow: () => true,
      isValid: (data) =>
        (data.weight_kg === null || isProfileMetricValueWithinRange("weight_kg", data.weight_kg)) &&
        (data.max_hr === null || isProfileMetricValueWithinRange("max_hr", data.max_hr)) &&
        (data.resting_hr === null ||
          isProfileMetricValueWithinRange("resting_hr", data.resting_hr)) &&
        (data.ftp === null || isProfileMetricValueWithinRange("ftp", data.ftp)) &&
        (data.threshold_pace === null ||
          isProfileMetricValueWithinRange("threshold_pace_seconds_per_km", data.threshold_pace)) &&
        (data.css === null || isProfileMetricValueWithinRange("css_seconds_per_100m", data.css)),
    },
    {
      id: "goals_preferences",
      canSkip: true,
      component: GoalsPreferencesStep,
      shouldShow: () => true,
      isValid: (data) =>
        data.training_preferences_hydration_status !== "loading" &&
        data.training_preferences_error === null,
    },
    {
      id: "groups_people",
      canSkip: true,
      component: GroupsAndPeopleStep,
      shouldShow: () => true,
      isValid: () => true,
    },
    {
      id: "summary",
      canSkip: false,
      component: SummaryStep,
      shouldShow: () => true,
      isValid: () => true,
    },
  ];
}
