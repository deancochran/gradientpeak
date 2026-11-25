import { addDaysDateOnlyUtc, materializePlanToEvents } from "../..";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { estimateActivityPlanForTrainingContext } from "../activity-plan-planning-estimate";
import type { BuildProjectionEngineInputShape } from "../buildProjectionEngineInput";
import {
  assessFeasibility,
  fromProfileGoals,
  generateReferenceTrajectory,
  resolveConstraintProfile,
  resolveEventDemand,
} from "../periodization";
import { aggregateWeeklyPlannedLoad } from "../verification/aggregateWeeklyPlannedLoad";
import {
  LOCAL_TRAINING_PLAN_FIXTURE,
  LOCAL_TRAINING_PLAN_TEMPLATES,
} from "./fixtures/local-training-plan-verification";

export type ToleranceClass = "tight" | "moderate" | "flexible";
type Goal = BuildProjectionEngineInputShape["expanded_plan"]["goals"][number];

export interface SystemPlanContractScenario {
  key: "local_exact_run" | "local_capacity_bounded" | "local_multi_goal";
  matchType: "exact" | "crosswalk";
  toleranceClass: ToleranceClass;
  expectedWeeklyLoad: number;
  currentLongTermLoad: number;
  startDate: string;
  endDate: string;
  goals: readonly Goal[];
  expectedMode: "target_seeking" | "capacity_bounded";
}

const localGoal: Goal = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Local 10K",
  target_date: "2026-04-02",
  priority: 9,
  targets: [
    {
      target_type: "power_threshold",
      target_watts: 240,
      test_duration_s: 3600,
      activity_category: "bike",
    },
  ],
};

export const SYSTEM_PLAN_CONTRACT_MATRIX: readonly SystemPlanContractScenario[] = [
  {
    key: "local_exact_run",
    matchType: "exact",
    toleranceClass: "tight",
    expectedWeeklyLoad: 80,
    currentLongTermLoad: 35,
    startDate: "2026-03-09",
    endDate: "2026-04-05",
    goals: [localGoal],
    expectedMode: "capacity_bounded",
  },
  {
    key: "local_capacity_bounded",
    matchType: "crosswalk",
    toleranceClass: "flexible",
    expectedWeeklyLoad: 180,
    currentLongTermLoad: 20,
    startDate: "2026-03-09",
    endDate: "2026-04-05",
    goals: [
      {
        ...localGoal,
        id: "30000000-0000-4000-8000-000000000002",
        target_date: "2026-03-23",
        targets: [
          {
            target_type: "power_threshold",
            target_watts: 380,
            test_duration_s: 3600,
            activity_category: "bike",
          },
        ],
      },
    ],
    expectedMode: "capacity_bounded",
  },
  {
    key: "local_multi_goal",
    matchType: "crosswalk",
    toleranceClass: "moderate",
    expectedWeeklyLoad: 90,
    currentLongTermLoad: 40,
    startDate: "2026-03-09",
    endDate: "2026-04-05",
    goals: [
      localGoal,
      {
        ...localGoal,
        id: "30000000-0000-4000-8000-000000000003",
        name: "Local A race",
        target_date: "2026-04-02",
        priority: 10,
      },
    ],
    expectedMode: "target_seeking",
  },
];

export const TOLERANCE_BY_CLASS = {
  tight: { weeklyFloorLoad: 20, weeklyPct: 0.08, blockPct: 0.08, meanPct: 0.08 },
  moderate: { weeklyFloorLoad: 25, weeklyPct: 0.12, blockPct: 0.1, meanPct: 0.1 },
  flexible: { weeklyFloorLoad: 30, weeklyPct: 0.15, blockPct: 0.12, meanPct: 0.12 },
} as const;
const templateById = new Map(
  LOCAL_TRAINING_PLAN_TEMPLATES.map((template) => [template.id, template]),
);
const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const diffDays = (start: string, end: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000,
    ),
  );

export function getEnabledSystemPlanContractScenarios() {
  return SYSTEM_PLAN_CONTRACT_MATRIX;
}
export function getToleranceDefinition(toleranceClass: ToleranceClass) {
  return TOLERANCE_BY_CLASS[toleranceClass];
}

export function assertExactLaneHasCanonicalPlannedLoad(
  sessions: ReadonlyArray<{
    title?: string;
    common_load: { status: string; load?: number | null };
  }>,
): void {
  const unavailable = sessions.filter(
    (session) =>
      session.common_load.status === "unavailable" ||
      session.common_load.load === null ||
      session.common_load.load === undefined,
  );
  if (unavailable.length > 0 || sessions.length === 0)
    throw new Error(
      `Exact system-plan lane requires canonical planned Common Load for every session; unavailable: ${unavailable.map((session) => session.title ?? "untitled").join(", ") || "all"}`,
    );
}

export function materializeSystemPlanScenario(scenario: SystemPlanContractScenario) {
  const materializedSessions = materializePlanToEvents(
    LOCAL_TRAINING_PLAN_FIXTURE.structure,
    scenario.startDate,
    "UTC",
  ).map((event) => {
    const template = event.activity_plan_id ? templateById.get(event.activity_plan_id) : undefined;
    if (!template)
      throw new Error(`Missing local activity template for ${event.activity_plan_id ?? "null"}`);
    const asOf = "2026-03-01T00:00:00.000Z";
    const estimation = estimateActivityPlanForTrainingContext({
      structure: template.structure,
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        asOf,
        "local-fixture-athlete",
      ),
      asOf,
      stage: "scheduled",
      planId: template.id,
      scheduledEventId: `${event.scheduled_date}:${event.title}`,
    });
    const common_load = estimation.prescriptionQuantification.summary.commonLoad;
    const estimated_load = common_load.status === "unavailable" ? null : common_load.load;
    return {
      ...event,
      template_name: template.name,
      common_load,
      estimated_load,
      estimated_load_status:
        common_load.status === "unavailable"
          ? ("unavailable" as const)
          : common_load.status === "partial"
            ? ("partial" as const)
            : ("complete" as const),
    };
  });
  if (scenario.matchType === "exact") assertExactLaneHasCanonicalPlannedLoad(materializedSessions);
  const weeklyActualLoad = aggregateWeeklyPlannedLoad(
    materializedSessions.map((session) => ({
      scheduled_date: session.scheduled_date,
      event_type: "planned" as const,
      estimated_load: session.estimated_load,
      estimated_load_status: session.estimated_load_status,
      activity_plan_id: session.activity_plan_id,
      title: session.title,
    })),
  ).weeks.map((week) => ({
    weekIndex: week.week_index,
    weekStart: week.week_start_date,
    value: week.planned_weekly_load,
    status: week.planned_weekly_load_status ?? "unavailable",
  }));
  return {
    scenario,
    startDate: scenario.startDate,
    endDate: materializedSessions.at(-1)?.scheduled_date ?? scenario.endDate,
    materializedSessions,
    weeklyActualLoad,
  };
}

function aggregateWeeklyValues(
  entries: Array<{ date: string; value: number }>,
  startDate: string,
  endDate: string,
) {
  const weeks = Array.from(
    { length: Math.max(1, Math.floor(diffDays(startDate, endDate) / 7) + 1) },
    (_, index) => ({
      weekIndex: index,
      weekStart: addDaysDateOnlyUtc(startDate, index * 7),
      value: 0,
    }),
  );
  for (const entry of entries) {
    const week = weeks[Math.min(weeks.length - 1, Math.floor(diffDays(startDate, entry.date) / 7))];
    if (week) week.value = round1(week.value + entry.value);
  }
  return weeks;
}

export function buildReferenceTrajectoryForScenario(
  scenario: SystemPlanContractScenario,
  startDate: string,
  endDate: string,
) {
  const normalizedGoals = fromProfileGoals(
    scenario.goals.map((goal) => {
      if (!goal.id || !goal.targets) {
        throw new Error(`Local scenario ${scenario.key} has incomplete goal evidence`);
      }
      return { ...goal, id: goal.id, targets: [...goal.targets] };
    }),
  );
  const resolvedDemands = normalizedGoals
    .map(resolveEventDemand)
    .flatMap((result) => (result.status === "supported" ? [result.demand] : []));
  const constraintProfile = resolveConstraintProfile({
    optimizationProfile: "balanced",
    preferenceProfile: defaultAthletePreferenceProfile,
    activity_category: resolvedDemands[0]?.activity_category ?? "bike",
  });
  const feasibility = assessFeasibility({
    currentLongTermLoad: scenario.currentLongTermLoad,
    weeksToPeak: Math.max(
      1,
      Math.ceil(diffDays(startDate, normalizedGoals.at(-1)?.target_date ?? endDate) / 7),
    ),
    goals: normalizedGoals,
    resolvedDemands,
    preferenceProfile: defaultAthletePreferenceProfile,
    constraintProfile,
  });
  const referenceTrajectory = generateReferenceTrajectory({
    startDate,
    endDate,
    currentLongTermLoad: scenario.currentLongTermLoad,
    goals: normalizedGoals,
    resolvedDemands,
    preferenceProfile: defaultAthletePreferenceProfile,
    constraintProfile,
    feasibility: feasibility.feasibility,
    mode: feasibility.mode,
  });
  return {
    feasibility,
    weeklyTargetLoad: aggregateWeeklyValues(
      referenceTrajectory.points.map((point) => ({ date: point.date, value: point.target_load })),
      startDate,
      endDate,
    ),
  };
}

export function compareScenarioToReference(scenario: SystemPlanContractScenario) {
  const materialized = materializeSystemPlanScenario(scenario);
  const reference = buildReferenceTrajectoryForScenario(
    scenario,
    materialized.startDate,
    materialized.endDate,
  );
  const tolerance = getToleranceDefinition(scenario.toleranceClass);
  const rawTargetMean =
    sum(reference.weeklyTargetLoad.map((week) => week.value)) / reference.weeklyTargetLoad.length;
  const scale = rawTargetMean > 0 ? scenario.expectedWeeklyLoad / rawTargetMean : 1;
  const weeklyComparison = materialized.weeklyActualLoad.map((week, index) => {
    const target = round1((reference.weeklyTargetLoad[index]?.value ?? 0) * scale);
    const actual = week.value;
    const complete = week.status === "complete";
    const absError = actual === null || !complete ? null : round1(Math.abs(actual - target));
    const toleranceLoad = round1(Math.max(tolerance.weeklyFloorLoad, target * tolerance.weeklyPct));
    return {
      weekIndex: index,
      weekStart: week.weekStart,
      actual,
      actualStatus: week.status,
      target,
      absError,
      toleranceLoad,
      withinTolerance: absError === null ? null : absError <= toleranceLoad,
    };
  });
  const blockStatus = weeklyComparison.some((week) => week.actualStatus === "unavailable")
    ? "unavailable"
    : weeklyComparison.some((week) => week.actualStatus === "partial")
      ? "partial"
      : "complete";
  const blockActual = weeklyComparison.some((week) => week.actual === null)
    ? null
    : round1(sum(weeklyComparison.flatMap((week) => (week.actual === null ? [] : [week.actual]))));
  const blockTarget = round1(sum(weeklyComparison.map((week) => week.target)));
  const blockAbsError =
    blockActual === null || blockStatus !== "complete"
      ? null
      : round1(Math.abs(blockActual - blockTarget));
  const blockToleranceLoad = round1(
    Math.max(tolerance.weeklyFloorLoad * weeklyComparison.length, blockTarget * tolerance.blockPct),
  );
  const actualMean = blockActual === null ? null : round1(blockActual / weeklyComparison.length);
  const targetMean = round1(blockTarget / weeklyComparison.length);
  const meanAbsError =
    actualMean === null || blockStatus !== "complete"
      ? null
      : round1(Math.abs(actualMean - targetMean));
  const meanToleranceLoad = round1(
    Math.max(tolerance.weeklyFloorLoad, targetMean * tolerance.meanPct),
  );
  return {
    scenario,
    tolerance,
    materialized,
    reference,
    weeklyComparison,
    blockActual,
    blockStatus,
    blockTarget,
    blockAbsError,
    blockToleranceLoad,
    actualMean,
    targetMean,
    meanAbsError,
    meanToleranceLoad,
  };
}
