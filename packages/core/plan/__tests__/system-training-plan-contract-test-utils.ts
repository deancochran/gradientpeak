import { estimateActivity } from "../../estimation";
import {
  defaultAthletePreferenceProfile,
  type AthletePreferenceProfile,
} from "../../schemas/settings/profile_settings";
import { ALL_SAMPLE_PLANS, SYSTEM_TEMPLATES } from "../../samples";
import type { SystemTrainingPlanTemplate } from "../../samples/training-plans";
import { addDaysDateOnlyUtc, materializePlanToEvents } from "../..";
import {
  deriveFixtureBackedSystemPlanContracts,
  type FixtureBackedContractGoal,
} from "../verification/deriveFixtureBackedSystemPlanContracts";
import {
  assessFeasibility,
  fromProfileGoals,
  generateReferenceTrajectory,
  resolveConstraintProfile,
  resolveEventDemand,
} from "../periodization";

export type ToleranceClass = "tight" | "moderate" | "flexible";

export interface ToleranceDefinition {
  weeklyFloorTss: number;
  weeklyPct: number;
  blockPct: number;
  meanPct: number;
}

export const TOLERANCE_BY_CLASS: Record<ToleranceClass, ToleranceDefinition> = {
  tight: {
    weeklyFloorTss: 20,
    weeklyPct: 0.08,
    blockPct: 0.08,
    meanPct: 0.08,
  },
  moderate: {
    weeklyFloorTss: 25,
    weeklyPct: 0.12,
    blockPct: 0.1,
    meanPct: 0.1,
  },
  flexible: {
    weeklyFloorTss: 30,
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
  currentCtl: number;
  currentAtl?: number;
  preferenceProfile?: AthletePreferenceProfile;
  goals: readonly FixtureBackedContractGoal[];
  expectedMode: "target_seeking" | "capacity_bounded";
  notes: string;
}

const planByName = new Map(ALL_SAMPLE_PLANS.map((plan) => [plan.name, plan]));
const templateById = new Map(
  SYSTEM_TEMPLATES.map((template) => [template.id, template]),
);

const estimationProfile = {
  ftp: 255,
  threshold_hr: 172,
  max_hr: 190,
  resting_hr: 56,
  weight_kg: 71,
  threshold_pace_seconds_per_km: 255,
};

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
    notes:
      "Primary exact-lane 5K contract using the only true 5K-specific system plan.",
  },
  {
    scenario_id: "intermediate_rich_half",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 160,
    expected_mode: "capacity_bounded",
    notes:
      "Primary tight-band alignment case for a feasible single A-goal run build.",
  },
  {
    scenario_id: "advanced_marathon_build",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 145,
    expected_mode: "capacity_bounded",
    notes:
      "Primary long-event contract with long-run emphasis and tight block tolerance.",
  },
  {
    scenario_id: "boundary_feasible_bike",
    enabled: true,
    match_type: "exact",
    expected_weekly_load: 220,
    expected_mode: "target_seeking",
    notes:
      "Primary exact-lane bike contract for the only true cycling system plan.",
  },
  {
    scenario_id: "low_availability_high_ambition",
    enabled: true,
    match_type: "crosswalk",
    expected_weekly_load: 215,
    expected_mode: "capacity_bounded",
    notes:
      "Constraint-stress case proving controlled deviation under limited capacity.",
  },
  {
    scenario_id: "infeasible_stretch_goal",
    enabled: true,
    match_type: "crosswalk",
    expected_weekly_load: 195,
    expected_mode: "capacity_bounded",
    notes:
      "Feasibility gate: acceptable variance is wider but safety alignment stays strict.",
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
    notes:
      "Coaching-behavior slot for sustained peak handling between close A races.",
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

const currentAtlByScenarioKey: Partial<Record<string, number>> = {
  exact_5k_speed_block: 36,
  intermediate_rich_half: 49,
  advanced_marathon_build: 64,
  boundary_feasible_bike: 47,
};

export const SYSTEM_PLAN_CONTRACT_MATRIX: SystemPlanContractScenario[] =
  deriveFixtureBackedSystemPlanContracts(CONTRACT_SCENARIO_OVERRIDES).map(
    (contract) => {
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
        currentCtl: contract.current_ctl,
        currentAtl: currentAtlByScenarioKey[scenarioKey],
        preferenceProfile: contract.preference_profile,
        goals: contract.goals,
        expectedMode: contract.expected_mode,
        notes: contract.notes,
      };
    },
  );

function diffDays(startDate: string, endDate: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) -
        Date.parse(`${startDate}T00:00:00.000Z`)) /
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

export function materializeSystemPlanScenario(
  scenario: SystemPlanContractScenario,
) {
  const plan = getPlanOrThrow(scenario.planName);
  const startDate =
    typeof (plan.structure as { start_date?: unknown }).start_date === "string"
      ? ((plan.structure as { start_date: string }).start_date ?? "")
      : "";

  const materializedSessions = materializePlanToEvents(
    plan.structure,
    startDate,
  )
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

      const estimation = estimateActivity({
        profile: estimationProfile as never,
        ftp: estimationProfile.ftp,
        thresholdHr: estimationProfile.threshold_hr,
        thresholdPaceSecondsPerKm:
          estimationProfile.threshold_pace_seconds_per_km,
        activityCategory: template.activity_category as never,
        structure: template.structure,
      });

      return {
        ...event,
        template_name: template.name,
        activity_category: template.activity_category,
        estimated_tss: estimation.tss,
        estimated_duration_seconds: estimation.duration,
      };
    });

  const endDate =
    materializedSessions[materializedSessions.length - 1]?.scheduled_date ??
    startDate;
  const weeklyActualLoad = aggregateWeeklyValues(
    materializedSessions.map((session) => ({
      date: session.scheduled_date,
      value: session.estimated_tss,
    })),
    startDate,
    endDate,
  );

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
) {
  const totalWeeks = Math.max(
    1,
    Math.floor(diffDays(startDate, endDate) / 7) + 1,
  );
  const weeks = Array.from({ length: totalWeeks }, (_, index) => ({
    weekIndex: index,
    weekStart: addDaysDateOnlyUtc(startDate, index * 7),
    value: 0,
  }));

  for (const entry of entries) {
    const weekIndex = Math.min(
      weeks.length - 1,
      Math.max(0, Math.floor(diffDays(startDate, entry.date) / 7)),
    );
    const week = weeks[weekIndex];
    if (week) {
      week.value = round1(week.value + entry.value);
    }
  }

  return weeks;
}

export function buildReferenceTrajectoryForScenario(
  scenario: SystemPlanContractScenario,
  startDate: string,
  endDate: string,
) {
  const preferenceProfile =
    scenario.preferenceProfile ?? defaultAthletePreferenceProfile;
  const normalizedGoals = fromProfileGoals(scenario.goals as never);
  const resolvedDemands = normalizedGoals
    .map((goal) => resolveEventDemand(goal))
    .flatMap((result) =>
      result.status === "supported" ? [result.demand] : [],
    );
  const primarySport = resolvedDemands[0]?.sport ?? "run";
  const constraintProfile = resolveConstraintProfile({
    optimizationProfile: "balanced",
    preferenceProfile,
    sport: primarySport,
  });
  const endGoalDate =
    normalizedGoals[normalizedGoals.length - 1]?.target_date ?? endDate;
  const weeksToPeak = Math.max(
    1,
    Math.ceil(diffDays(startDate, endGoalDate) / 7),
  );
  const feasibility = assessFeasibility({
    currentCtl: scenario.currentCtl,
    weeksToPeak,
    goals: normalizedGoals,
    resolvedDemands,
    preferenceProfile,
    constraintProfile,
  });
  const referenceTrajectory = generateReferenceTrajectory({
    startDate,
    endDate,
    currentCtl: scenario.currentCtl,
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
        value: point.target_tss,
      })),
      startDate,
      endDate,
    ),
  };
}

export function compareScenarioToReference(
  scenario: SystemPlanContractScenario,
) {
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
  const targetScale =
    rawTargetMean > 0 ? scenario.expectedWeeklyLoad / rawTargetMean : 1;
  const weeklyComparison = materialized.weeklyActualLoad.map((week, index) => {
    const target =
      (reference.weeklyTargetLoad[index]?.value ?? 0) * targetScale;
    const actual = week.value;
    const absError = round1(Math.abs(actual - target));
    const toleranceTss = round1(
      Math.max(tolerance.weeklyFloorTss, target * tolerance.weeklyPct),
    );

    return {
      weekIndex: index,
      weekStart: week.weekStart,
      actual,
      target: round1(target),
      absError,
      toleranceTss,
      withinTolerance: absError <= toleranceTss,
    };
  });
  const comparedWeeks = weeklyComparison.length;
  const blockActual = round1(sum(weeklyComparison.map((week) => week.actual)));
  const blockTarget = round1(sum(weeklyComparison.map((week) => week.target)));
  const blockAbsError = round1(Math.abs(blockActual - blockTarget));
  const blockToleranceTss = round1(
    Math.max(
      tolerance.weeklyFloorTss * comparedWeeks,
      blockTarget * tolerance.blockPct,
    ),
  );
  const actualMean = round1(blockActual / comparedWeeks);
  const targetMean = round1(blockTarget / comparedWeeks);
  const meanAbsError = round1(Math.abs(actualMean - targetMean));
  const meanToleranceTss = round1(
    Math.max(tolerance.weeklyFloorTss, targetMean * tolerance.meanPct),
  );

  return {
    scenario,
    tolerance,
    materialized,
    reference,
    weeklyComparison,
    blockActual,
    blockTarget,
    blockAbsError,
    blockToleranceTss,
    actualMean,
    targetMean,
    meanAbsError,
    meanToleranceTss,
  };
}
