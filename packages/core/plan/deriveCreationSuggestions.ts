import {
  CREATION_MAX_CTL_RAMP_PER_WEEK,
  CREATION_MAX_WEEKLY_TSS_RAMP_PCT,
  creationAvailabilityConfigSchema,
  creationConstraintsSchema,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  type CreationConfigLocks,
  type CreationContextSummary,
  type CreationProvenance,
  type CreationRecentInfluence,
} from "../schemas/training_plan_structure";
import { countAvailableTrainingDays } from "./availabilityUtils";

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
    recent_influence?: CreationRecentInfluence;
    constraints?: Partial<{
      hard_rest_days: string[];
      min_sessions_per_week: number;
      max_sessions_per_week: number;
      max_single_session_duration_minutes: number;
      goal_difficulty_preference: "conservative" | "balanced" | "stretch";
    }>;
    max_weekly_tss_ramp_pct?: number;
    max_ctl_ramp_per_week?: number;
  };
  locks?: Partial<CreationConfigLocks>;
  now_iso?: string;
}

export interface CreationSuggestions {
  availability_config: ReturnType<
    typeof creationAvailabilityConfigSchema.parse
  >;
  availability_provenance: CreationProvenance;
  recent_influence: { influence_score: number };
  recent_influence_action: "accepted" | "edited" | "disabled";
  recent_influence_provenance: CreationProvenance;
  constraints: ReturnType<typeof creationConstraintsSchema.parse>;
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
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

function markerToScore(marker: "low" | "moderate" | "high"): number {
  if (marker === "high") {
    return 1;
  }

  if (marker === "moderate") {
    return 0.6;
  }

  return 0.2;
}

function deriveRampCapSuggestions(input: {
  context: CreationContextSummary;
  profileMode: "no_data" | "rich_data" | "mixed";
}): { maxWeeklyTssRampPct: number; maxCtlRampPerWeek: number } {
  const { context, profileMode } = input;
  const sessionsRange = context.recommended_sessions_per_week_range;
  const sessionsMidpoint = (sessionsRange.min + sessionsRange.max) / 2;
  const sessionsSpread = sessionsRange.max - sessionsRange.min;

  const historyScore =
    context.history_availability_state === "rich"
      ? 1
      : context.history_availability_state === "sparse"
        ? 0.55
        : 0.2;
  const markerScore =
    (markerToScore(context.recent_consistency_marker) +
      markerToScore(context.effort_confidence_marker) +
      markerToScore(context.profile_metric_completeness_marker)) /
    3;
  const sessionDemandScore = clamp((sessionsMidpoint - 2.5) / 4.5, 0, 1);
  const rangeCertaintyScore = clamp(1 - sessionsSpread / 4, 0, 1);

  const aggressivenessScore = clamp(
    historyScore * 0.32 +
      context.signal_quality * 0.33 +
      markerScore * 0.2 +
      sessionDemandScore * 0.15,
    0,
    1,
  );
  const profileMultiplier =
    profileMode === "no_data" ? 0.9 : profileMode === "rich_data" ? 1.1 : 1;
  const certaintyMultiplier = 0.9 + rangeCertaintyScore * 0.18;

  const maxWeeklyTssRampPct = Number(
    clamp(
      (3.5 + aggressivenessScore * 5.8) *
        profileMultiplier *
        certaintyMultiplier,
      0,
      CREATION_MAX_WEEKLY_TSS_RAMP_PCT,
    ).toFixed(2),
  );

  const maxCtlRampPerWeek = Number(
    clamp(
      (1 + aggressivenessScore * 3.2) * profileMultiplier * certaintyMultiplier,
      0,
      CREATION_MAX_CTL_RAMP_PER_WEEK,
    ).toFixed(2),
  );

  return {
    maxWeeklyTssRampPct,
    maxCtlRampPerWeek,
  };
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

  const rampCapSuggestions = deriveRampCapSuggestions({
    context,
    profileMode,
  });

  const availabilitySuggestion = buildAvailabilityForSessionRange(
    context.recommended_sessions_per_week_range.min,
    context.recommended_sessions_per_week_range.max,
    profileMode,
  );

  const influenceSuggestion = {
    influence_score: Number(
      clamp(
        profileMode === "no_data" ? 0 : influenceMidpoint,
        context.recommended_recent_influence_range.min,
        context.recommended_recent_influence_range.max,
      ).toFixed(3),
    ),
  };

  const sessionsMin = context.recommended_sessions_per_week_range.min;
  const sessionsMax = context.recommended_sessions_per_week_range.max;
  const sessionsMidpoint = Math.max(1, (sessionsMin + sessionsMax) / 2);
  const baselineMidpoint =
    (context.recommended_baseline_tss_range.min +
      context.recommended_baseline_tss_range.max) /
    2;

  const preferredDaysFromContext = context.rationale_codes
    .filter((code) => code.startsWith("preferred_day_"))
    .map((code) => code.replace("preferred_day_", ""))
    .filter((day): day is (typeof WEEKDAY_ORDER)[number] =>
      WEEKDAY_ORDER.includes(day as (typeof WEEKDAY_ORDER)[number]),
    );

  const hardRestDays = WEEKDAY_ORDER.filter(
    (day) => !preferredDaysFromContext.includes(day),
  ).slice(0, Math.max(1, 7 - sessionsMax));

  const suggestedMaxSingleDuration = Math.round(
    clamp((baselineMidpoint / sessionsMidpoint) * 0.9, 60, 180),
  );

  const constraintsSuggestion = creationConstraintsSchema.parse({
    hard_rest_days:
      hardRestDays.length > 0
        ? hardRestDays
        : profileMode === "rich_data"
          ? ["wednesday"]
          : profileMode === "mixed"
            ? ["wednesday", "friday"]
            : ["wednesday", "friday", "sunday"],
    min_sessions_per_week: sessionsMin,
    max_sessions_per_week: sessionsMax,
    max_single_session_duration_minutes: suggestedMaxSingleDuration,
    goal_difficulty_preference:
      profileMode === "rich_data" && baselineMidpoint > 450
        ? "stretch"
        : profileMode === "rich_data"
          ? "balanced"
          : "conservative",
  });

  const availableTrainingDays = countAvailableTrainingDays({
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
    locks?.recent_influence?.locked &&
    input.existing_values?.recent_influence?.influence_score !== undefined
  ) {
    if (
      input.existing_values.recent_influence.influence_score !==
      influenceSuggestion.influence_score
    ) {
      conflicts.push("recent_influence_locked_differs_from_suggestion");
    }
  }

  if (
    locks?.max_weekly_tss_ramp_pct?.locked &&
    input.existing_values?.max_weekly_tss_ramp_pct !== undefined &&
    input.existing_values.max_weekly_tss_ramp_pct !==
      rampCapSuggestions.maxWeeklyTssRampPct
  ) {
    conflicts.push("max_weekly_tss_ramp_pct_locked_differs_from_suggestion");
  }

  if (
    locks?.max_ctl_ramp_per_week?.locked &&
    input.existing_values?.max_ctl_ramp_per_week !== undefined &&
    input.existing_values.max_ctl_ramp_per_week !==
      rampCapSuggestions.maxCtlRampPerWeek
  ) {
    conflicts.push("max_ctl_ramp_per_week_locked_differs_from_suggestion");
  }

  return {
    availability_config: availabilitySuggestion,
    availability_provenance: buildProvenance(
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
    max_weekly_tss_ramp_pct: rampCapSuggestions.maxWeeklyTssRampPct,
    max_ctl_ramp_per_week: rampCapSuggestions.maxCtlRampPerWeek,
    locked_conflicts: conflicts,
  };
}
