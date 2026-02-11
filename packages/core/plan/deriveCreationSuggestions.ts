import {
  creationAvailabilityConfigSchema,
  creationConstraintsSchema,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  type CreationConfigLocks,
  type CreationContextSummary,
  type CreationProvenance,
} from "../schemas/training_plan_structure";

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export interface DeriveCreationSuggestionsInput {
  context: CreationContextSummary;
  existing_values?: {
    availability_config?: unknown;
    baseline_load_weekly_tss?: number;
    recent_influence_score?: number;
    constraints?: Partial<{
      weekly_load_floor_tss: number;
      weekly_load_cap_tss: number;
      hard_rest_days: string[];
      min_sessions_per_week: number;
      max_sessions_per_week: number;
      max_single_session_duration_minutes: number;
      goal_difficulty_preference: "conservative" | "balanced" | "stretch";
    }>;
  };
  locks?: Partial<CreationConfigLocks>;
  now_iso?: string;
}

export interface CreationSuggestions {
  availability_config: ReturnType<
    typeof creationAvailabilityConfigSchema.parse
  >;
  availability_provenance: CreationProvenance;
  baseline_load: { weekly_tss: number };
  baseline_load_provenance: CreationProvenance;
  recent_influence: { influence_score: number };
  recent_influence_action: "accepted" | "edited" | "disabled";
  recent_influence_provenance: CreationProvenance;
  constraints: ReturnType<typeof creationConstraintsSchema.parse>;
  locked_conflicts: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildProvenance(
  nowIso: string,
  confidence: number,
  rationaleCodes: string[],
): CreationProvenance {
  return creationProvenanceSchema.parse({
    source: "suggested",
    confidence: Number(clamp(confidence, 0, 1).toFixed(3)),
    rationale: rationaleCodes.slice(0, 8),
    references: [
      { type: "completed_activities", id: "recent_42d" },
      { type: "activity_efforts", id: "recent_efforts" },
      { type: "profile_metrics", id: "profile_snapshot" },
    ],
    updated_at: nowIso,
  });
}

function buildAvailabilityForSessionRange(
  minSessions: number,
  maxSessions: number,
  profile: "no_data" | "rich_data" | "mixed",
) {
  const targetSessions = Math.round((minSessions + maxSessions) / 2);
  const trainingDays =
    profile === "rich_data"
      ? ["monday", "tuesday", "thursday", "friday", "saturday", "sunday"]
      : profile === "mixed"
        ? ["monday", "tuesday", "thursday", "saturday", "sunday"]
        : ["monday", "tuesday", "thursday", "saturday"];

  const days = WEEKDAY_ORDER.map((day) => {
    const isTrainingDay = trainingDays.includes(day);
    return {
      day,
      windows: isTrainingDay
        ? [
            {
              start_minute_of_day:
                day === "saturday" || day === "sunday" ? 450 : 360,
              end_minute_of_day:
                day === "saturday" || day === "sunday" ? 570 : 450,
            },
          ]
        : [],
      max_sessions: isTrainingDay ? (targetSessions > 5 ? 2 : 1) : 0,
    };
  });

  return creationAvailabilityConfigSchema.parse({
    template:
      profile === "no_data"
        ? "low"
        : profile === "rich_data"
          ? "high"
          : "moderate",
    days,
  });
}

function getAvailableTrainingDays(input: {
  availabilityDays: Array<{ day: string; windows: Array<unknown> }>;
  hardRestDays: string[];
}): number {
  const availableDays = new Set(
    input.availabilityDays
      .filter((day) => day.windows.length > 0)
      .map((day) => day.day),
  );

  for (const restDay of input.hardRestDays) {
    availableDays.delete(restDay);
  }

  return availableDays.size;
}

/**
 * Builds deterministic profile-aware suggestions for creation config.
 *
 * - no-data profiles return conservative defaults with lower confidence
 * - rich-data profiles return tighter ranges and higher confidence
 */
export function deriveCreationSuggestions(
  input: DeriveCreationSuggestionsInput,
): CreationSuggestions {
  const nowIso = input.now_iso ?? new Date().toISOString();
  const context = input.context;

  const profileMode =
    context.history_availability_state === "none"
      ? "no_data"
      : context.history_availability_state === "rich" &&
          context.signal_quality >= 0.7
        ? "rich_data"
        : "mixed";

  const baselineMidpoint =
    (context.recommended_baseline_tss_range.min +
      context.recommended_baseline_tss_range.max) /
    2;
  const influenceMidpoint =
    (context.recommended_recent_influence_range.min +
      context.recommended_recent_influence_range.max) /
    2;
  const suggestionsConfidence =
    profileMode === "no_data"
      ? Math.min(context.signal_quality, 0.35)
      : profileMode === "rich_data"
        ? Math.max(context.signal_quality, 0.75)
        : clamp(context.signal_quality, 0.4, 0.75);

  const availabilitySuggestion = buildAvailabilityForSessionRange(
    context.recommended_sessions_per_week_range.min,
    context.recommended_sessions_per_week_range.max,
    profileMode,
  );

  const baselineSuggestion = {
    weekly_tss: Math.round(
      profileMode === "no_data"
        ? Math.min(baselineMidpoint, 200)
        : baselineMidpoint,
    ),
  };

  const influenceSuggestion = {
    influence_score: Number(
      clamp(
        profileMode === "no_data" ? 0 : influenceMidpoint,
        context.recommended_recent_influence_range.min,
        context.recommended_recent_influence_range.max,
      ).toFixed(3),
    ),
  };

  const constraintsSuggestion = creationConstraintsSchema.parse({
    weekly_load_floor_tss: Math.max(
      0,
      Math.round(baselineSuggestion.weekly_tss * 0.75),
    ),
    weekly_load_cap_tss: Math.round(
      baselineSuggestion.weekly_tss *
        (profileMode === "rich_data" ? 1.2 : 1.45),
    ),
    hard_rest_days:
      profileMode === "rich_data"
        ? ["wednesday"]
        : profileMode === "mixed"
          ? ["wednesday", "friday"]
          : ["wednesday", "friday", "sunday"],
    min_sessions_per_week: context.recommended_sessions_per_week_range.min,
    max_sessions_per_week: context.recommended_sessions_per_week_range.max,
    max_single_session_duration_minutes: profileMode === "rich_data" ? 120 : 90,
    goal_difficulty_preference:
      profileMode === "rich_data" ? "balanced" : "conservative",
  });

  const availableTrainingDays = getAvailableTrainingDays({
    availabilityDays: availabilitySuggestion.days,
    hardRestDays: constraintsSuggestion.hard_rest_days,
  });

  const normalizedMinSessions = Math.min(
    constraintsSuggestion.min_sessions_per_week ?? availableTrainingDays,
    availableTrainingDays,
  );
  const normalizedMaxSessions = Math.min(
    constraintsSuggestion.max_sessions_per_week ?? availableTrainingDays,
    availableTrainingDays,
  );

  const normalizedConstraintsSuggestion = creationConstraintsSchema.parse({
    ...constraintsSuggestion,
    min_sessions_per_week: Math.min(
      normalizedMinSessions,
      normalizedMaxSessions,
    ),
    max_sessions_per_week: Math.max(
      normalizedMinSessions,
      normalizedMaxSessions,
    ),
  });

  const locks = input.locks;
  const conflicts: string[] = [];

  if (
    locks?.baseline_load?.locked &&
    input.existing_values?.baseline_load_weekly_tss
  ) {
    if (
      input.existing_values.baseline_load_weekly_tss !==
      baselineSuggestion.weekly_tss
    ) {
      conflicts.push("baseline_load_locked_differs_from_suggestion");
    }
  }

  if (
    locks?.recent_influence?.locked &&
    input.existing_values?.recent_influence_score !== undefined
  ) {
    if (
      input.existing_values.recent_influence_score !==
      influenceSuggestion.influence_score
    ) {
      conflicts.push("recent_influence_locked_differs_from_suggestion");
    }
  }

  return {
    availability_config: availabilitySuggestion,
    availability_provenance: buildProvenance(
      nowIso,
      suggestionsConfidence,
      context.rationale_codes,
    ),
    baseline_load: baselineSuggestion,
    baseline_load_provenance: buildProvenance(
      nowIso,
      suggestionsConfidence,
      context.rationale_codes,
    ),
    recent_influence: influenceSuggestion,
    recent_influence_action:
      profileMode === "no_data"
        ? creationRecentInfluenceActionEnum.enum.disabled
        : creationRecentInfluenceActionEnum.enum.accepted,
    recent_influence_provenance: buildProvenance(
      nowIso,
      suggestionsConfidence,
      context.rationale_codes,
    ),
    constraints: normalizedConstraintsSuggestion,
    locked_conflicts: conflicts,
  };
}
