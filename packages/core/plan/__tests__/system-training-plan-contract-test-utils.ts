import { addDaysDateOnlyUtc, materializePlanToEvents } from "../..";
import type { CommonLoadAggregate, CommonLoadResult } from "../../load";
import {
  ALL_SAMPLE_PLANS,
  deriveSystemActivityTemplateActivityCategory,
  SYSTEM_TEMPLATES,
} from "../../samples";
import type { SystemTrainingPlanTemplate } from "../../samples/training-plans";
import {
  type AthletePreferenceProfile,
  defaultAthletePreferenceProfile,
} from "../../schemas/settings/profile_settings";
import { estimateActivityPlanForTrainingContext } from "../activity-plan-planning-estimate";
import {
  assessFeasibility,
  fromProfileGoals,
  generateReferenceTrajectory,
  resolveConstraintProfile,
  resolveEventDemand,
} from "../periodization";
import { aggregateWeeklyPlannedLoad } from "../verification/aggregateWeeklyPlannedLoad";
import {
  deriveFixtureBackedSystemPlanContracts,
  type FixtureBackedContractGoal,
} from "../verification/deriveFixtureBackedSystemPlanContracts";
import {
  SYSTEM_PLAN_VERIFICATION_AS_OF,
  SYSTEM_PLAN_VERIFICATION_PERFORMANCE_TARGETS,
} from "../verification/fixtures/planning-performance-targets";
import { validateSystemTemplateActivityPlan } from "../verification/systemPlanAudit";

export type ToleranceClass = "tight" | "moderate" | "flexible";

export interface ToleranceDefinition {
  weeklyFloorLoad: number;
  weeklyPct: number;
  blockPct: number;
  meanPct: number;
}

export const TOLERANCE_BY_CLASS: Record<ToleranceClass, ToleranceDefinition> = {
  tight: {
    weeklyFloorLoad: 20,
    weeklyPct: 0.08,
    blockPct: 0.08,
    meanPct: 0.08,
  },
  moderate: {
    weeklyFloorLoad: 25,
    weeklyPct: 0.12,
    blockPct: 0.1,
    meanPct: 0.1,
  },
  flexible: {
    weeklyFloorLoad: 30,
    weeklyPct: 0.15,
    blockPct: 0.12,
    meanPct: 0.12,
  },
};

export interface SystemPlanContractScenario {
  key: string;
  enabled: boolean;
  planId: string;
  planName: string;
  mappingId: string;
  matchType: "exact" | "crosswalk";
  toleranceClass: ToleranceClass;
  expectedWeeklyLoad: number;
  currentLongTermLoad: number;
  currentRecentLoad?: number;
  startDate: string;
  endDate: string;
  preferenceProfile?: AthletePreferenceProfile;
  goals: readonly FixtureBackedContractGoal[];
  expectedMode: "target_seeking" | "capacity_bounded";
  notes: string;
}

const planByName = new Map(ALL_SAMPLE_PLANS.map((plan) => [plan.name, plan]));
const templateById = new Map(SYSTEM_TEMPLATES.map((template) => [template.id, template]));

const CONTRACT_SCENARIO_OVERRIDES = [
  {
    scenario_id: "beginner_no_history_5k",
    enabled: false,
    match_type: "crosswalk",
    expected_weekly_load: 185,
    expected_mode: "target_seeking",
    notes: "Intended matrix slot for no-history conservative floor behavior.",
  },
  {
    scenario_id: "recreational_sparse_10k",
    enabled: false,
    match_type: "crosswalk",
    expected_weekly_load: 190,
    expected_mode: "target_seeking",
    notes: "Planned matrix slot for moderate run-build verification.",
  },
  {
    scenario_id: "exact_5k_speed_block",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 140,
    expected_mode: "target_seeking",
    notes: "Primary exact-lane 5K contract using the only true 5K-specific system plan.",
  },
  {
    scenario_id: "intermediate_rich_half",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 160,
    expected_mode: "capacity_bounded",
    notes: "Primary tight-band alignment case for a feasible single A-goal run build.",
  },
  {
    scenario_id: "advanced_marathon_build",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 145,
    expected_mode: "capacity_bounded",
    notes: "Primary long-event contract with long-run emphasis and tight block tolerance.",
  },
  {
    scenario_id: "boundary_feasible_bike",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 220,
    expected_mode: "target_seeking",
    notes: "Primary exact-lane bike contract for the only true cycling system plan.",
  },
  {
    scenario_id: "low_availability_high_ambition",
    enabled: true,
    match_type: "crosswalk",
    expected_weekly_load: 215,
    expected_mode: "capacity_bounded",
    notes: "Constraint-stress case proving controlled deviation under limited capacity.",
  },
  {
    scenario_id: "infeasible_stretch_goal",
    enabled: true,
    match_type: "crosswalk",
    expected_weekly_load: 195,
    expected_mode: "capacity_bounded",
    notes: "Feasibility gate: acceptable variance is wider but safety alignment stays strict.",
  },
  {
    scenario_id: "masters_conservative_profile",
    enabled: false,
    match_type: "crosswalk",
    expected_weekly_load: 190,
    expected_mode: "target_seeking",
    notes: "Reserved matrix slot for demographic safety bias.",
  },
  {
    scenario_id: "b_race_before_a_race",
    enabled: true,
    match_type: "crosswalk",
    expected_weekly_load: 170,
    expected_mode: "target_seeking",
    notes: "Coaching-behavior matrix slot for micro-taper without full reset.",
  },
  {
    scenario_id: "two_close_a_goals",
    enabled: true,
    match_type: "crosswalk",
    expected_weekly_load: 170,
    expected_mode: "target_seeking",
    notes: "Coaching-behavior slot for sustained peak handling between close A races.",
  },
  {
    scenario_id: "same_day_a_b_priority",
    enabled: false,
    match_type: "crosswalk",
    expected_weekly_load: 190,
    expected_mode: "target_seeking",
    notes: "Reserved matrix slot for same-day priority semantics.",
  },
] as const;

const currentRecentLoadByScenarioKey: Partial<Record<string, number>> = {
  exact_5k_speed_block: 36,
  intermediate_rich_half: 49,
  advanced_marathon_build: 64,
  boundary_feasible_bike: 47,
};

export const SYSTEM_PLAN_CONTRACT_MATRIX: SystemPlanContractScenario[] =
  deriveFixtureBackedSystemPlanContracts(CONTRACT_SCENARIO_OVERRIDES).map((contract) => {
    const scenarioKey = contract.key;

    return {
      key: scenarioKey,
      enabled: contract.enabled,
      planId: contract.plan_id,
      planName: contract.plan_name,
      mappingId: contract.mapping_id,
      matchType: contract.match_type,
      toleranceClass: contract.tolerance_class,
      expectedWeeklyLoad: contract.expected_weekly_load,
      currentLongTermLoad: contract.current_longTermLoad,
      currentRecentLoad: currentRecentLoadByScenarioKey[scenarioKey],
      startDate: contract.start_date,
      endDate: contract.end_date,
      preferenceProfile: contract.preference_profile,
      goals: contract.goals,
      expectedMode: contract.expected_mode,
      notes: contract.notes,
    };
  });

function diffDays(startDate: string, endDate: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86400000,
    ),
  );
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getPlanOrThrow(planName: string): SystemTrainingPlanTemplate {
  const plan = planByName.get(planName);
  if (!plan) {
    throw new Error(`Missing system plan fixture: ${planName}`);
  }

  return plan;
}

export function getToleranceDefinition(toleranceClass: ToleranceClass) {
  return TOLERANCE_BY_CLASS[toleranceClass];
}

export function getEnabledSystemPlanContractScenarios() {
  return SYSTEM_PLAN_CONTRACT_MATRIX.filter((scenario) => scenario.enabled);
}

function canonicalPlannedLoad(commonLoad: CommonLoadResult | CommonLoadAggregate): {
  value: number | null;
  status: "complete" | "partial" | "unavailable";
} {
  if (commonLoad.status === "unavailable") return { value: null, status: "unavailable" };
  if (commonLoad.status === "partial") {
    return { value: commonLoad.load, status: "partial" };
  }
  return { value: commonLoad.load, status: "complete" };
}

export function assertExactLaneHasCanonicalPlannedLoad(
  sessions: ReadonlyArray<{
    title?: string;
    common_load: CommonLoadResult | CommonLoadAggregate;
  }>,
): void {
  const unavailable = sessions.filter((session) => {
    const load = canonicalPlannedLoad(session.common_load);
    return load.status === "unavailable" || load.value === null;
  });
  if (unavailable.length > 0 || sessions.length === 0) {
    throw new Error(
      `Exact system-plan lane requires canonical planned Common Load for every session; unavailable: ${unavailable.map((session) => session.title ?? "untitled").join(", ") || "all"}`,
    );
  }
}

export function materializeSystemPlanScenario(scenario: SystemPlanContractScenario) {
  const plan = getPlanOrThrow(scenario.planName);
  const configuredStartDate =
    "start_date" in plan.structure && typeof plan.structure.start_date === "string"
      ? plan.structure.start_date
      : null;
  const startDate = configuredStartDate ?? scenario.startDate;

  const materializedSessions = materializePlanToEvents(plan.structure, startDate, "UTC")
    .filter((event) => event.event_type === "planned")
    .map((event) => {
      const template = event.activity_plan_id
        ? templateById.get(event.activity_plan_id)
        : undefined;

      if (!template) {
        throw new Error(
          `Missing linked system activity template for ${event.activity_plan_id ?? "null"}`,
        );
      }

      const estimation = estimateActivityPlanForTrainingContext({
        structure: validateSystemTemplateActivityPlan(template),
        performanceTargets: SYSTEM_PLAN_VERIFICATION_PERFORMANCE_TARGETS,
        asOf: SYSTEM_PLAN_VERIFICATION_AS_OF,
        stage: "scheduled",
        planId: template.id,
        scheduledEventId: `${event.scheduled_date}:${event.title}`,
      });
      const commonLoad = estimation.prescriptionQuantification.summary.commonLoad;
      const canonicalLoad = canonicalPlannedLoad(commonLoad);

      return {
        ...event,
        template_name: template.name,
        activity_category: deriveSystemActivityTemplateActivityCategory(template.structure),
        prescriptionQuantification: estimation.prescriptionQuantification,
        common_load: commonLoad,
        estimated_load: canonicalLoad.value,
        estimated_load_status: canonicalLoad.status,
        estimated_duration_seconds: estimation.durationEstimate.valueSeconds,
      };
    });

  if (scenario.matchType === "exact") {
    assertExactLaneHasCanonicalPlannedLoad(materializedSessions);
  }

  const endDate =
    materializedSessions[materializedSessions.length - 1]?.scheduled_date ?? scenario.endDate;
  const weeklyActualLoad = aggregateWeeklyPlannedLoad(
    materializedSessions.map((session) => ({
      scheduled_date: session.scheduled_date,
      event_type: "planned",
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
    plan,
    startDate,
    endDate,
    materializedSessions,
    weeklyActualLoad,
  };
}

function aggregateWeeklyValues(
  entries: Array<{ date: string; value: number }>,
  startDate: string,
  endDate: string,
  preserveUnknown?: false,
): Array<{ weekIndex: number; weekStart: string; value: number }>;
function aggregateWeeklyValues(
  entries: Array<{ date: string; value: number | null }>,
  startDate: string,
  endDate: string,
  preserveUnknown: true,
): Array<{ weekIndex: number; weekStart: string; value: number | null }>;
function aggregateWeeklyValues(
  entries: Array<{ date: string; value: number | null }>,
  startDate: string,
  endDate: string,
  preserveUnknown = false,
) {
  const totalWeeks = Math.max(1, Math.floor(diffDays(startDate, endDate) / 7) + 1);
  const weeks: Array<{ weekIndex: number; weekStart: string; value: number | null }> = Array.from(
    { length: totalWeeks },
    (_, index) => ({
      weekIndex: index,
      weekStart: addDaysDateOnlyUtc(startDate, index * 7),
      value: 0,
    }),
  );

  for (const entry of entries) {
    const weekIndex = Math.min(
      weeks.length - 1,
      Math.max(0, Math.floor(diffDays(startDate, entry.date) / 7)),
    );
    const week = weeks[weekIndex];
    if (week) {
      if (entry.value === null) {
        if (preserveUnknown) week.value = null;
      } else if (week.value !== null) {
        week.value = round1(week.value + entry.value);
      }
    }
  }

  return weeks;
}

export function buildReferenceTrajectoryForScenario(
  scenario: SystemPlanContractScenario,
  startDate: string,
  endDate: string,
) {
  const preferenceProfile = scenario.preferenceProfile ?? defaultAthletePreferenceProfile;
  const normalizedGoals = fromProfileGoals(
    scenario.goals.map((goal) => {
      if (goal.id === undefined || goal.targets === undefined) {
        throw new Error(`Scenario ${scenario.key} has incomplete goal fixture evidence`);
      }
      return { ...goal, id: goal.id, targets: [...goal.targets] };
    }),
  );
  const resolvedDemands = normalizedGoals
    .map((goal) => resolveEventDemand(goal))
    .flatMap((result) => (result.status === "supported" ? [result.demand] : []));
  const primaryActivityCategory = resolvedDemands[0]?.activity_category ?? "run";
  const constraintProfile = resolveConstraintProfile({
    optimizationProfile: "balanced",
    preferenceProfile,
    activity_category: primaryActivityCategory,
  });
  const endGoalDate = normalizedGoals[normalizedGoals.length - 1]?.target_date ?? endDate;
  const weeksToPeak = Math.max(1, Math.ceil(diffDays(startDate, endGoalDate) / 7));
  const feasibility = assessFeasibility({
    currentLongTermLoad: scenario.currentLongTermLoad,
    weeksToPeak,
    goals: normalizedGoals,
    resolvedDemands,
    preferenceProfile,
    constraintProfile,
  });
  const referenceTrajectory = generateReferenceTrajectory({
    startDate,
    endDate,
    currentLongTermLoad: scenario.currentLongTermLoad,
    goals: normalizedGoals,
    resolvedDemands,
    preferenceProfile,
    constraintProfile,
    feasibility: feasibility.feasibility,
    mode: feasibility.mode,
  });

  return {
    normalizedGoals,
    resolvedDemands,
    constraintProfile,
    feasibility,
    referenceTrajectory,
    weeklyTargetLoad: aggregateWeeklyValues(
      referenceTrajectory.points.map((point) => ({
        date: point.date,
        value: point.target_load,
      })),
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
    sum(reference.weeklyTargetLoad.map((week) => week.value)) /
    Math.max(1, reference.weeklyTargetLoad.length);
  const targetScale = rawTargetMean > 0 ? scenario.expectedWeeklyLoad / rawTargetMean : 1;
  const weeklyComparison = materialized.weeklyActualLoad.map((week, index) => {
    const target = (reference.weeklyTargetLoad[index]?.value ?? 0) * targetScale;
    const actual = week.value;
    const complete = week.status === "complete";
    const absError = actual === null || !complete ? null : round1(Math.abs(actual - target));
    const toleranceLoad = round1(Math.max(tolerance.weeklyFloorLoad, target * tolerance.weeklyPct));

    return {
      weekIndex: index,
      weekStart: week.weekStart,
      actual,
      actualStatus: week.status,
      target: round1(target),
      absError,
      toleranceLoad,
      withinTolerance: absError === null ? null : absError <= toleranceLoad,
    };
  });
  const comparedWeeks = weeklyComparison.length;
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
    Math.max(tolerance.weeklyFloorLoad * comparedWeeks, blockTarget * tolerance.blockPct),
  );
  const actualMean = blockActual === null ? null : round1(blockActual / comparedWeeks);
  const targetMean = round1(blockTarget / comparedWeeks);
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
