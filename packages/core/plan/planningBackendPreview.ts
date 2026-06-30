import {
  type PreviewCreationConfigInput,
  previewCreationConfigInputSchema,
} from "../contracts/training-plan-creation/schemas";
import { addDaysDateOnlyUtc } from "./dateOnlyUtc";
import type { PlanningContext } from "./planningContext";
import type { PlanningGoal } from "./planningGoals";
import { mapPlanningPreferencesToCreationConstraints } from "./planningPreferences";

export type PlanningBackendCreationConfigMappingResult =
  | { ok: true; input: PreviewCreationConfigInput }
  | { ok: false; reason: string };

type BackendMappedGoal = ReturnType<typeof buildMinimalPlanGoal>["goal"];

type BackendGoalMappingResult =
  | { ok: true; goal: BackendMappedGoal }
  | { ok: false; reason: string };

export function mapPlanningContextToPreviewCreationConfigInput(
  context: PlanningContext,
): PlanningBackendCreationConfigMappingResult {
  if (context.goals.length === 0) {
    return { ok: false, reason: "No goals configured." };
  }

  const goalMappings = context.goals.map((goal) => mapGoalToMinimalPlanGoal(context, goal));
  const goals = goalMappings.flatMap((mapping) => (mapping.ok ? [mapping.goal] : []));

  if (goals.length === 0) {
    return {
      ok: false,
      reason:
        goalMappings.find((mapping) => !mapping.ok)?.reason ??
        "No goals can be mapped to backend planning targets yet.",
    };
  }

  const constraints = mapPlanningPreferencesToCreationConstraints({
    preferences: context.preferences,
    preferredWeekdays: context.scheduling.preferredWeekdays,
  });
  const parsed = previewCreationConfigInputSchema.safeParse({
    minimal_plan: {
      plan_start_date: context.scheduling.startDate || context.anchorDate,
      goals,
    },
    creation_input: {
      user_values: Object.keys(constraints).length > 0 ? { constraints } : undefined,
    },
    ...(context.athleteContext.physiology.currentFitnessCtl.value !== null
      ? { starting_ctl_override: context.athleteContext.physiology.currentFitnessCtl.value }
      : {}),
    ...(context.athleteContext.physiology.currentFatigueAtl.value !== null
      ? { starting_atl_override: context.athleteContext.physiology.currentFatigueAtl.value }
      : {}),
    post_create_behavior: { autonomous_mutation_enabled: false },
  });

  if (!parsed.success) {
    return {
      ok: false,
      reason: `Backend planning input is incomplete: ${parsed.error.issues[0]?.message ?? "unknown validation issue"}`,
    };
  }

  return { ok: true, input: parsed.data };
}

function mapGoalToMinimalPlanGoal(
  context: PlanningContext,
  goal: PlanningGoal,
): BackendGoalMappingResult {
  const targetDate =
    goal.targetDate ??
    (goal.targetOffsetDays !== null
      ? addDaysDateOnlyUtc(context.anchorDate, goal.targetOffsetDays)
      : context.preferences.durationWeeks !== null
        ? addDaysDateOnlyUtc(
            context.anchorDate,
            Math.max(0, context.preferences.durationWeeks * 7 - 1),
          )
        : null);
  if (!targetDate || !goal.objective) {
    if (!targetDate) {
      return { ok: false, reason: `Goal "${goal.title}" needs a target date or plan duration.` };
    }
    return {
      ok: false,
      reason: `Goal "${goal.title}" needs a performance, completion, or threshold objective.`,
    };
  }

  const base = { name: goal.title, target_date: targetDate, priority: goal.priority };

  if (goal.objective.type === "event_performance") {
    const targetTime = goal.objective.target_time_s;
    if (!goal.objective.distance_m || !targetTime) {
      return { ok: false, reason: `Goal "${goal.title}" needs distance and target time.` };
    }
    return buildMinimalPlanGoal({
      ...base,
      targets: [
        {
          target_type: "race_performance",
          distance_m: goal.objective.distance_m,
          target_time_s: targetTime,
          activity_category: goal.objective.activity_category,
        },
      ],
    });
  }

  if (goal.objective.type === "completion") {
    const activityCategory = goal.objective.activity_category ?? goal.activityCategory;
    if (activityCategory === null || activityCategory === undefined) {
      return {
        ok: false,
        reason: `Completion goal "${goal.title}" needs an activity category before backend preview.`,
      };
    }
    if (!goal.objective.distance_m) {
      return {
        ok: false,
        reason: `Completion goal "${goal.title}" needs distance before backend preview.`,
      };
    }
    const targetTime = goal.objective.duration_s;
    if (!targetTime) {
      return {
        ok: false,
        reason: `Completion goal "${goal.title}" needs a target duration before backend preview.`,
      };
    }
    return buildMinimalPlanGoal({
      ...base,
      targets: [
        {
          target_type: "race_performance",
          distance_m: goal.objective.distance_m,
          target_time_s: targetTime,
          activity_category: activityCategory,
        },
      ],
    });
  }

  if (goal.objective.type === "threshold") {
    const activityCategory = goal.objective.activity_category ?? goal.activityCategory ?? null;
    if (
      activityCategory === null &&
      (goal.objective.metric === "power" || goal.objective.metric === "pace")
    ) {
      return {
        ok: false,
        reason: `Threshold goal "${goal.title}" needs an activity category before backend preview.`,
      };
    }
    if (goal.objective.metric === "power") {
      if (activityCategory === null) {
        return {
          ok: false,
          reason: `Threshold goal "${goal.title}" needs an activity category before backend preview.`,
        };
      }
      return buildMinimalPlanGoal({
        ...base,
        targets: [
          {
            target_type: "power_threshold",
            target_watts: goal.objective.value,
            test_duration_s: goal.objective.test_duration_s ?? 1200,
            activity_category: activityCategory,
          },
        ],
      });
    }
    if (goal.objective.metric === "pace") {
      if (activityCategory === null) {
        return {
          ok: false,
          reason: `Threshold goal "${goal.title}" needs an activity category before backend preview.`,
        };
      }
      return buildMinimalPlanGoal({
        ...base,
        targets: [
          {
            target_type: "pace_threshold",
            target_speed_mps: goal.objective.value,
            test_duration_s: goal.objective.test_duration_s ?? 1200,
            activity_category: activityCategory,
          },
        ],
      });
    }
    return buildMinimalPlanGoal({
      ...base,
      targets: [{ target_type: "hr_threshold", target_lthr_bpm: Math.round(goal.objective.value) }],
    });
  }

  return {
    ok: false,
    reason: `Consistency goal "${goal.title}" needs a backend target contract before authoritative preview.`,
  };
}

function buildMinimalPlanGoal(goal: {
  name: string;
  target_date: string;
  priority: number;
  targets: Array<
    | {
        target_type: "race_performance";
        distance_m: number;
        target_time_s: number;
        activity_category: "run" | "bike" | "swim" | "other";
      }
    | {
        target_type: "power_threshold";
        target_watts: number;
        test_duration_s: number;
        activity_category: "run" | "bike" | "swim" | "other";
      }
    | {
        target_type: "pace_threshold";
        target_speed_mps: number;
        test_duration_s: number;
        activity_category: "run" | "bike" | "swim" | "other";
      }
    | { target_type: "hr_threshold"; target_lthr_bpm: number }
  >;
}) {
  return { ok: true as const, goal };
}

export function createPlanningContextFingerprint(context: PlanningContext) {
  const sessionFingerprint = context.sessions
    .map((session) =>
      [
        session.localId,
        session.offsetDays,
        session.intent?.type ?? "none",
        session.intent?.targetDurationSeconds ?? "none",
        session.intent?.targetTss ?? "none",
        session.activityPlan?.id ?? "unassigned",
        session.activityPlan?.estimatedTss ?? "none",
        session.activityPlan?.estimatedDurationSeconds ?? "none",
      ].join(":"),
    )
    .join("|");
  const goalFingerprint = context.goals
    .map((goal) =>
      [
        goal.localId,
        goal.sourceProfileGoalId ?? "local",
        goal.title,
        goal.targetOffsetDays ?? "none",
        goal.priority,
        goal.activityCategory ?? "none",
        goal.objective?.type ?? "none",
      ].join(":"),
    )
    .join("|");

  return JSON.stringify({
    anchorDate: context.anchorDate,
    athlete: {
      ctl: context.athleteContext.physiology.currentFitnessCtl.value,
      atl: context.athleteContext.physiology.currentFatigueAtl.value,
      tsb: context.athleteContext.physiology.currentFormTsb.value,
      ftp: context.athleteContext.physiology.ftpWatts.value,
      thresholdHr: context.athleteContext.physiology.thresholdHeartRateBpm.value,
      weight: context.athleteContext.body.weightKg.value,
    },
    goals: goalFingerprint,
    preferences: context.preferences,
    sessions: sessionFingerprint,
    scheduling: context.scheduling,
  });
}
