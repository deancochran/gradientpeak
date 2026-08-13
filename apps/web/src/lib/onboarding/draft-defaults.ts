type DraftProfile = {
  dob: string | null;
  full_name: string | null;
  gender: "male" | "female" | "other" | null;
  planning_timezone: string | null;
  username: string | null;
  weight_kg: number | null;
};

type DraftSettings = {
  onboarding_intents?: string[];
  dose_limits: {
    min_sessions_per_week?: number;
    max_sessions_per_week?: number;
    max_single_session_duration_minutes?: number;
    max_weekly_duration_minutes?: number;
  };
  training_style: { progression_pace: number };
};

type SerializableGoalPayload = Record<string, string | number | boolean | null | undefined>;

function consistencyTarget(payload: SerializableGoalPayload, field: string): number | undefined {
  if (payload.type !== "consistency") return undefined;
  const value = payload[field];
  return typeof value === "number" ? value : undefined;
}

export function buildOnboardingDraftDefaults(input: {
  profile: DraftProfile;
  settings?: DraftSettings;
  metrics: Array<{ metric_type: string; value: number }>;
  goal?: {
    title: string;
    target_date: string;
    activity_category: string;
    target_payload: SerializableGoalPayload;
  };
}) {
  const latestMetric = (type: string) =>
    input.metrics.find((metric) => metric.metric_type === type)?.value;
  return {
    full_name: input.profile.full_name ?? "",
    username: input.profile.username ?? "",
    dob: input.profile.dob ?? undefined,
    gender: input.profile.gender ?? undefined,
    planning_timezone: input.profile.planning_timezone ?? undefined,
    intents: input.settings?.onboarding_intents ?? [],
    weight_kg: latestMetric("weight_kg") ?? input.profile.weight_kg ?? undefined,
    max_hr: latestMetric("max_hr"),
    resting_hr: latestMetric("resting_hr"),
    settings: input.settings
      ? {
          preset:
            input.settings.training_style.progression_pace <= 0.25
              ? ("safer" as const)
              : input.settings.training_style.progression_pace >= 0.75
                ? ("push_harder" as const)
                : ("balanced" as const),
          minSessionsPerWeek: input.settings.dose_limits.min_sessions_per_week ?? 3,
          maxSessionsPerWeek: input.settings.dose_limits.max_sessions_per_week ?? 5,
          maxSingleSessionMinutes:
            input.settings.dose_limits.max_single_session_duration_minutes ?? 90,
          maxWeeklyMinutes: input.settings.dose_limits.max_weekly_duration_minutes ?? 360,
        }
      : null,
    goal: input.goal
      ? {
          ...input.goal,
          target_sessions_per_week: consistencyTarget(
            input.goal.target_payload,
            "target_sessions_per_week",
          ),
          target_weeks: consistencyTarget(input.goal.target_payload, "target_weeks"),
        }
      : null,
  };
}
