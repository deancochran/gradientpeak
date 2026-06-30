import type { ComponentType } from "react";

export interface OnboardingData {
  full_name: string;
  username: string;
  intent:
    | "train_event"
    | "improve_fitness"
    | "track_activities"
    | "groups"
    | "follow_people"
    | "coach_group"
    | "explore"
    | null;
  experience_level: "beginner" | "intermediate" | "advanced" | "skip" | null;
  dob: string | null;
  weight_kg: number | null;
  weight_unit: "kg" | "lbs";
  gender: "male" | "female" | "other" | null;
  sport_interests: Array<"cycling" | "running" | "swimming" | "strength" | "other">;
  max_hr: number | null;
  resting_hr: number | null;
  lthr: number | null;
  ftp: number | null;
  threshold_pace: number | null;
  css: number | null;
  vo2max: number | null;
  training_frequency: "1-2" | "3-4" | "5-6" | "7+" | null;
  equipment: string[];
  goals: string[];
}

export type StepId = "profile" | "connect_import" | "training_baseline" | "summary";

export type IntegrationProvider = "strava" | "wahoo" | "trainingpeaks" | "garmin" | "zwift";

export type OnboardingFieldSources = Partial<Record<keyof OnboardingData, string>>;

export interface ProviderSyncStatus {
  status: "idle" | "queued" | "running" | "succeeded" | "partial" | "failed" | "timed_out";
  canContinue: boolean;
  providers: Array<{
    provider: IntegrationProvider;
    status: string;
    blocking: boolean;
    message?: string;
  }>;
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
    options?: { source?: "estimated" | "imported" | "user" },
  ) => void;
  fieldSources?: OnboardingFieldSources;
  integrations?: Array<{ provider: IntegrationProvider }>;
  connectionOverview?: Array<{
    canConnect: boolean;
    connected: boolean;
    provider: IntegrationProvider;
  }>;
  providerSyncStatus?: ProviderSyncStatus;
  onRetryProviderSync?: () => void;
  onRefreshIntegrations?: () => void;
  onClearProviderRequirement?: (provider: IntegrationProvider) => void;
  usernameAvailability?: {
    available?: boolean;
    isChecking: boolean;
  };
}
