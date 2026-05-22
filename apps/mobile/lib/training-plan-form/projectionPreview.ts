import { canonicalizeMinimalTrainingPlanCreate } from "@repo/core/plan/canonicalization";
import type { ProjectionChartPayload } from "@repo/core/plan/projectionTypes";
import { withLegacyTrainingLoadAliases } from "@repo/core/plan/trainingLoadTimeline";
import {
  type AthleteTrainingSettings,
  type AthleteTrainingSettingsFormInput,
  athleteTrainingSettingsFormSchema,
} from "@repo/core/schemas/settings/profile_settings";
import type { GoalTargetV2 } from "@repo/core/schemas/training_plan_structure";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";
import type { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { computeLocalCreationPreview } from "@/lib/training-plan-form/localPreview";

export type TrainingPreferencesValues = AthleteTrainingSettings | AthleteTrainingSettingsFormInput;

type TrainingPlanSnapshot = ReturnType<typeof useTrainingPlanSnapshot>;
type FitnessHistoryPoint = { date: string; ctl?: number | null };
type ScheduledEventInput = {
  starts_at?: string | null;
  scheduled_date?: string | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  activity_plan?: unknown;
};

const weekdayToRRuleDay = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function parseRRule(rule: string) {
  const body = rule.trim().startsWith("RRULE:") ? rule.trim().slice(6) : rule.trim();
  return new Map(
    body.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key ?? "", value ?? ""];
    }),
  );
}

function parseRRuleUntilDateKey(value: string) {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const parsed = new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.000Z`,
    );
    return Number.isNaN(parsed.getTime()) ? null : toDateKey(parsed);
  }

  return null;
}

function getScheduledEventDateKeys(input: {
  event: ScheduledEventInput;
  windowStart?: string | null;
  windowEnd?: string | null;
}) {
  const startDate = input.event.scheduled_date ?? input.event.starts_at?.split("T")[0];
  if (!startDate) return [];

  const rule = input.event.recurrence?.rule ?? input.event.recurrence_rule;
  if (!rule || !input.windowStart || !input.windowEnd) {
    return [startDate];
  }

  const tokens = parseRRule(rule);
  if (tokens.get("FREQ") !== "WEEKLY") {
    return [startDate];
  }

  const start = new Date(`${startDate}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return [startDate];
  }

  const interval = Number(tokens.get("INTERVAL") ?? "1");
  if (!Number.isInteger(interval) || interval < 1) {
    return [startDate];
  }

  const byDay = tokens.get("BYDAY") ?? weekdayToRRuleDay[start.getUTCDay()];
  if (byDay !== weekdayToRRuleDay[start.getUTCDay()]) {
    return [startDate];
  }

  const untilDate = tokens.get("UNTIL") ? parseRRuleUntilDateKey(tokens.get("UNTIL")!) : null;
  const countToken = tokens.get("COUNT");
  const count = countToken ? Number(countToken) : 366;
  if (!Number.isInteger(count) || count < 1) {
    return [startDate];
  }

  const dates: string[] = [];
  const maxCount = Math.min(count, 366);
  for (let index = 0; index < maxCount; index += 1) {
    const occurrenceDate = new Date(start);
    occurrenceDate.setUTCDate(start.getUTCDate() + index * interval * 7);
    const dateKey = toDateKey(occurrenceDate);
    if (untilDate && dateKey > untilDate) break;
    if (dateKey > input.windowEnd) break;
    if (dateKey >= input.windowStart) {
      dates.push(dateKey);
    }
  }

  return dates.length > 0 ? dates : [startDate];
}

function toGoalTargets(goal: TrainingPlanSnapshot["profileGoals"][number]): GoalTargetV2[] {
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
      }
    }
    default:
      return [];
  }
}

export function toPreviewMinimalPlan(snapshot: TrainingPlanSnapshot) {
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

  return canonicalizeMinimalTrainingPlanCreate({
    goals: datedGoals,
    plan_start_date: planStartDate,
  });
}

export function buildTrainingPreferencesProjectionPreview(input: {
  draft: TrainingPreferencesValues;
  fitnessHistory: FitnessHistoryPoint[];
  snapshot: TrainingPlanSnapshot;
}) {
  const minimalPlan = toPreviewMinimalPlan(input.snapshot);
  if (!minimalPlan) {
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
  const startingCtl =
    resolvedDraft.baseline_fitness?.is_enabled &&
    typeof resolvedDraft.baseline_fitness.override_ctl === "number"
      ? resolvedDraft.baseline_fitness.override_ctl
      : lastActualPoint?.ctl;
  const startingAtl =
    resolvedDraft.baseline_fitness?.is_enabled &&
    typeof resolvedDraft.baseline_fitness.override_atl === "number"
      ? resolvedDraft.baseline_fitness.override_atl
      : undefined;

  try {
    const preview = computeLocalCreationPreview({
      minimalPlan,
      creationInput: {},
      profileSettings: resolvedDraft,
      profileGoals: input.snapshot.profileGoals ?? [],
      startingCtlOverride: startingCtl ?? undefined,
      startingAtlOverride: startingAtl,
    });

    return {
      previewIdealCurve:
        preview.projectionChart.display_points?.map((point) => ({
          date: point.date,
          ctl: point.predicted_fitness_ctl,
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
  scheduledEvents?: ScheduledEventInput[] | null;
  scheduledWindowStart?: string | null;
  scheduledWindowEnd?: string | null;
}) {
  const baselineTimeline = input.snapshot.insightTimeline?.timeline ?? [];
  const baselineByDate = new Map(baselineTimeline.map((point) => [point.date, point]));
  const previewByDate = new Map(
    (input.projectionChart?.display_points ?? []).map((point) => [point.date, point]),
  );
  const dateSource = baselineTimeline.length > 0 ? baselineTimeline : [...previewByDate.values()];
  const dates = new Set(dateSource.map((point) => point.date));
  const scheduledLoadByDate = new Map<string, number>();

  for (const event of input.scheduledEvents ?? []) {
    const tss = getAuthoritativeActivityPlanMetrics(
      event.activity_plan as Parameters<typeof getAuthoritativeActivityPlanMetrics>[0],
    ).estimated_tss;
    if (typeof tss !== "number" || !Number.isFinite(tss)) continue;

    for (const date of getScheduledEventDateKeys({
      event,
      windowStart: input.scheduledWindowStart,
      windowEnd: input.scheduledWindowEnd,
    })) {
      dates.add(date);
      scheduledLoadByDate.set(date, (scheduledLoadByDate.get(date) ?? 0) + tss);
    }
  }

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
        ? (scheduledLoadByDate.get(date) ?? 0)
        : (baseline?.scheduled_tss ?? 0);

      return withLegacyTrainingLoadAliases({
        date,
        recommended_load_tss: Math.round(
          previewPoint?.predicted_load_tss ?? baseline?.ideal_tss ?? 0,
        ),
        scheduled_load_tss: Math.round(scheduledLoad),
        completed_load_tss: baseline?.actual_tss ?? 0,
        adherence_score: baseline?.adherence_score ?? 0,
        boundary_state: baseline?.boundary_state,
        boundary_reasons: baseline?.boundary_reasons,
        source: {
          recommended: previewPoint ? "goal_projection" : "baseline",
          scheduled: "calendar",
          completed: "recorded_activity",
        },
      });
    });
}
