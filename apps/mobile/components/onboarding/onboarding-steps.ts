import { isValidIdentity } from "@/lib/onboarding/validation";
import {
  ConnectAndImportStep,
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
        (!data.max_hr || (data.max_hr >= 100 && data.max_hr <= 220)) &&
        (!data.resting_hr || (data.resting_hr >= 30 && data.resting_hr <= 100)) &&
        (!data.ftp || (data.ftp >= 50 && data.ftp <= 500)) &&
        (!data.threshold_pace || (data.threshold_pace >= 120 && data.threshold_pace <= 600)) &&
        (!data.css || (data.css >= 60 && data.css <= 300)),
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
