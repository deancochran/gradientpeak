import { canonicalizeGoalProjectionInput } from "@repo/core/plan/goalProjectionInput";
import type { ProjectionChartPayload } from "@repo/core/plan/projectionTypes";
import { normalizeTrainingLoadTimelinePoint } from "@repo/core/plan/trainingLoadTimeline";
import {
  type AthleteTrainingSettings,
  type AthleteTrainingSettingsFormInput,
  athleteTrainingSettingsFormSchema,
} from "@repo/core/schemas/settings/profile_settings";
import type { TrainingPlanGoalTarget } from "@repo/core/schemas/training-plan-structure";
import type { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { computeLocalCreationPreview } from "@/lib/training-plan-form/localPreview";
import {
  aggregateScheduledLoadByDate,
  type ScheduledLoadEventInput,
} from "@/lib/training-plan-form/scheduledLoadAggregation";

export type TrainingPreferencesValues = AthleteTrainingSettings | AthleteTrainingSettingsFormInput;

type TrainingPlanSnapshot = ReturnType<typeof useTrainingPlanSnapshot>;
type FitnessHistoryPoint = { date: string; longTermLoad?: number | null };

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function toGoalTargets(
  goal: TrainingPlanSnapshot["profileGoals"][number],
): TrainingPlanGoalTarget[] {
  const objective = goal.objective;
  switch (objective.type) {
    case "event_performance": {
      if (typeof objective.distance_m !== "number") {
        return [];
      }

      const targetTime =
        typeof objective.target_time_s === "number"
          ? objective.target_time_s
          : typeof objective.target_speed_mps === "number" && objective.target_speed_mps > 0
            ? Math.round(objective.distance_m / objective.target_speed_mps)
            : null;

      if (targetTime === null) {
        return [];
      }

      return [
        {
          target_type: "race_performance",
          distance_m: objective.distance_m,
          target_time_s: targetTime,
          activity_category: objective.activity_category,
        },
      ];
    }
    case "threshold": {
      switch (objective.metric) {
        case "pace":
          return objective.activity_category
            ? [
                {
                  target_type: "pace_threshold",
                  target_speed_mps: objective.value,
                  test_duration_s: objective.test_duration_s ?? 1200,
                  activity_category: objective.activity_category,
                },
              ]
            : [];
        case "power":
          return objective.activity_category
            ? [
                {
                  target_type: "power_threshold",
                  target_watts: objective.value,
                  test_duration_s: objective.test_duration_s ?? 1200,
                  activity_category: objective.activity_category,
                },
              ]
            : [];
        case "hr":
          return [{ target_type: "hr_threshold", target_lthr_bpm: objective.value }];
        default:
          return [];
      }
    }
    default:
      return [];
  }
}

export function toGoalProjectionInput(snapshot: TrainingPlanSnapshot) {
  const datedGoals = (snapshot.profileGoals ?? [])
    .filter(
      (goal): goal is typeof goal & { target_date: string } =>
        typeof goal.target_date === "string" && goal.target_date.length > 0,
    )
    .flatMap((goal) => {
      const targets = toGoalTargets(goal);
      if (targets.length === 0) {
        return [];
      }

      return [
        {
          name: goal.title,
          target_date: goal.target_date,
          priority: goal.priority,
          targets,
        },
      ];
    });

  if (datedGoals.length === 0) {
    return null;
  }

  const planStartDate =
    snapshot.actualCurveData?.dataPoints?.[0]?.date ??
    snapshot.plan?.created_at?.slice(0, 10) ??
    toDateKey(new Date());

  return canonicalizeGoalProjectionInput({
    goals: datedGoals,
    plan_start_date: planStartDate,
  });
}

export function buildTrainingPreferencesProjectionPreview(input: {
  draft: TrainingPreferencesValues;
  fitnessHistory: FitnessHistoryPoint[];
  snapshot: TrainingPlanSnapshot;
}) {
  const projectionInput = toGoalProjectionInput(input.snapshot);
  if (!projectionInput) {
    return {
      previewIdealCurve: [],
      projectionChart: null as ProjectionChartPayload | null,
    };
  }

  const lastActualPoint = input.fitnessHistory[input.fitnessHistory.length - 1] ?? null;
  const parsedDraft = athleteTrainingSettingsFormSchema.safeParse(input.draft);
  if (!parsedDraft.success) {
    return {
      previewIdealCurve: [],
      projectionChart: null as ProjectionChartPayload | null,
    };
  }

  const resolvedDraft = parsedDraft.data;
  const startingLongTermLoad =
    resolvedDraft.baseline_fitness?.is_enabled &&
    typeof resolvedDraft.baseline_fitness.override_longTermLoad === "number"
      ? resolvedDraft.baseline_fitness.override_longTermLoad
      : lastActualPoint?.longTermLoad;
  const startingAtl =
    resolvedDraft.baseline_fitness?.is_enabled &&
    typeof resolvedDraft.baseline_fitness.override_recentLoad === "number"
      ? resolvedDraft.baseline_fitness.override_recentLoad
      : undefined;

  try {
    const preview = computeLocalCreationPreview({
      projectionInput,
      creationInput: {},
      profileSettings: resolvedDraft,
      profileGoals: input.snapshot.profileGoals ?? [],
      startingLongTermLoadOverride: startingLongTermLoad ?? undefined,
      startingAtlOverride: startingAtl,
    });

    return {
      previewIdealCurve:
        preview.projectionChart.points.map((point) => ({
          date: point.date,
          longTermLoad: point.predicted_fitness_longTermLoad,
        })) ?? [],
      projectionChart: preview.projectionChart,
    };
  } catch {
    return {
      previewIdealCurve: [],
      projectionChart: null as ProjectionChartPayload | null,
    };
  }
}

export function buildTrainingPreferencesLoadTimeline(input: {
  projectionChart: ProjectionChartPayload | null;
  snapshot: TrainingPlanSnapshot;
  scheduledEvents?: ScheduledLoadEventInput[] | null;
  scheduledWindowStart?: string | null;
  scheduledWindowEnd?: string | null;
}) {
  const baselineTimeline = (input.snapshot.actualCurveData?.dataPoints ?? []).map((point) => ({
    date: point.date,
    completed_load: point.dailyLoad,
    scheduled_load: 0,
    recommended_load: null as number | null,
    adherence_score: 0,
  }));
  const baselineByDate = new Map(baselineTimeline.map((point) => [point.date, point]));
  const previewByDate = new Map(
    (input.projectionChart?.points ?? []).map((point) => [point.date, point]),
  );
  const dailyRecommendedLoadByDate = new Map(
    (input.projectionChart?.daily_load_points ?? []).map((point) => [
      point.date,
      point.recommended_load,
    ]),
  );
  const dateSource = baselineTimeline.length > 0 ? baselineTimeline : [...previewByDate.values()];
  const dates = new Set(dateSource.map((point) => point.date));
  for (const date of dailyRecommendedLoadByDate.keys()) dates.add(date);
  const scheduledLoadAggregation = aggregateScheduledLoadByDate(input);
  for (const date of scheduledLoadAggregation.dates) dates.add(date);
  if (input.scheduledWindowStart) dates.add(input.scheduledWindowStart);
  if (input.scheduledWindowEnd) dates.add(input.scheduledWindowEnd);

  const hasCalendarScheduleForDate = (date: string) =>
    !!input.scheduledWindowStart &&
    !!input.scheduledWindowEnd &&
    date >= input.scheduledWindowStart &&
    date <= input.scheduledWindowEnd;

  return [...dates]
    .sort((left, right) => left.localeCompare(right))
    .map((date) => {
      const baseline = baselineByDate.get(date);
      const previewPoint = previewByDate.get(date);
      const scheduledLoad = hasCalendarScheduleForDate(date)
        ? (scheduledLoadAggregation.scheduledLoadByDate.get(date) ?? 0)
        : (baseline?.scheduled_load ?? 0);
      const tentativeScheduledLoad = hasCalendarScheduleForDate(date)
        ? (scheduledLoadAggregation.tentativeScheduledLoadByDate.get(date) ?? 0)
        : 0;

      return normalizeTrainingLoadTimelinePoint({
        date,
        recommended_common_load:
          dailyRecommendedLoadByDate.get(date) ?? baseline?.recommended_load ?? null,
        scheduled_common_load: scheduledLoad,
        tentative_scheduled_common_load: tentativeScheduledLoad,
        completed_common_load: baseline?.completed_load ?? null,
        adherence_score: baseline?.adherence_score ?? 0,
        source: {
          recommended: previewPoint ? "goal_projection" : "baseline",
          scheduled: "calendar",
          completed: "recorded_activity",
        },
      });
    });
}
