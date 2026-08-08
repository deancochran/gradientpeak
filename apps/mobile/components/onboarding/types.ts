import type {
  AthleteTrainingSettings,
  GoalEditorDraft,
  IntegrationProviderId,
  OnboardingIntent,
} from "@repo/core";
import type { ComponentType } from "react";
import type { AthleteBaselineFieldSource } from "@/components/athlete-baseline";
import type { IntegrationOverviewItem } from "@/components/integrations/IntegrationProviderList";
import type { CompactTrainingPreferencesValue } from "@/components/settings/training-preferences/compactTrainingPreferences";

export type TrainingPreferencesHydrationStatus = "loading" | "ready" | "error";

export type OnboardingSocialActionStatus = "pending" | "saved" | "failed" | "abandoned";

export type OnboardingGroupAction = {
  action: "join" | "request";
  action_key: string;
  group_id: string;
};

export interface OnboardingData {
  full_name: string;
  username: string;
  intent: OnboardingIntent[];
  experience_level: "beginner" | "intermediate" | "advanced" | "skip" | null;
  dob: string | null;
  weight_kg: number | null;
  weight_unit: "kg" | "lbs";
  gender: "male" | "female" | "other" | null;
  activity_category_interests: Array<"cycling" | "running" | "swimming" | "strength" | "other">;
  max_hr: number | null;
  resting_hr: number | null;
  vo2max: number | null;
  training_frequency: "1-2" | "3-4" | "5-6" | "7+" | null;
  equipment: string[];
  goals: string[];
  training_settings: AthleteTrainingSettings;
  compact_training_preferences: CompactTrainingPreferencesValue;
  training_preferences_patch: Partial<CompactTrainingPreferencesValue>;
  training_preferences_error: string | null;
  training_preferences_hydration_status: TrainingPreferencesHydrationStatus;
  should_save_training_preferences: boolean;
  goal_draft: GoalEditorDraft | null;
  should_create_goal: boolean;
  selected_invitation_ids: string[];
  selected_group_ids: string[];
  selected_group_actions: OnboardingGroupAction[];
  selected_follow_profile_ids: string[];
  social_action_statuses: Record<string, OnboardingSocialActionStatus>;
}

export type StepId =
  | "profile"
  | "connect_import"
  | "training_baseline"
  | "goals_preferences"
  | "groups_people"
  | "summary";

export type OnboardingStatusModal = {
  title: string;
  description: string;
  primaryLabel?: string;
  onPrimary?: () => void | Promise<void>;
  secondaryLabel?: string;
  onSecondary?: () => void | Promise<void>;
};

export type IntegrationProvider = IntegrationProviderId;

export type OnboardingFieldSources = Partial<
  Record<keyof OnboardingData, AthleteBaselineFieldSource>
>;

export interface WahooSetupStatus {
  status: "idle" | "refreshing" | "refreshed" | "failed" | "unsupported";
  canContinue: boolean;
  lastError: string | null;
}

export interface StepConfig {
  canSkip: boolean;
  id: StepId;
  component: ComponentType<StepProps>;
  shouldShow: (data: OnboardingData) => boolean;
  isValid: (data: OnboardingData) => boolean;
  title?: string;
}

export interface StepProps {
  data: OnboardingData;
  updateData: (
    updates: Partial<OnboardingData>,
    options?: {
      source?: "estimated" | "imported" | "user";
      sourceLabels?: Partial<Record<keyof OnboardingData, string>>;
    },
  ) => void;
  fieldSources?: OnboardingFieldSources;
  wahooSetupStatus?: WahooSetupStatus;
  onRetryWahooSetup?: () => void;
  integrationOverview?: IntegrationOverviewItem[];
  integrationOverviewError?: unknown;
  integrationOverviewLoading?: boolean;
  onRefreshIntegrations?: () => unknown;
  usernameAvailability?: {
    available?: boolean;
    isError: boolean;
    isChecking: boolean;
  };
}
