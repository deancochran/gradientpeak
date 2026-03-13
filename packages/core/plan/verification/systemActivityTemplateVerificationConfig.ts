export type SystemActivityTemplateCoverageStatus =
  | "missing"
  | "under-covered"
  | "covered"
  | "duplicate-risk";

export type FirstWaveCoverageCellKey =
  | "run_easy_recovery"
  | "run_tempo_threshold"
  | "run_long"
  | "run_high_intensity_race_pace"
  | "bike_easy_recovery"
  | "bike_threshold_sweet_spot"
  | "bike_long_endurance"
  | "bike_high_intensity_climbing";

export type SystemTrainingPlanGateScope = "first-wave" | "audit-only";

export interface FirstWaveCoverageCellDefinition {
  key: FirstWaveCoverageCellKey;
  sport: "run" | "bike";
  label: string;
}

export const COVERAGE_STATUS_THRESHOLD = {
  missing: 0,
  underCovered: 1,
  covered: 2,
  weakVarietyUniqueTemplateMinimum: 3,
  overReuseShareMaximum: 0.5,
} as const;

export const FIRST_WAVE_COVERAGE_CELLS: readonly FirstWaveCoverageCellDefinition[] =
  [
    {
      key: "run_easy_recovery",
      sport: "run",
      label: "Run easy or recovery",
    },
    {
      key: "run_tempo_threshold",
      sport: "run",
      label: "Run tempo or threshold",
    },
    {
      key: "run_long",
      sport: "run",
      label: "Run long",
    },
    {
      key: "run_high_intensity_race_pace",
      sport: "run",
      label: "Run high intensity or race pace",
    },
    {
      key: "bike_easy_recovery",
      sport: "bike",
      label: "Bike recovery or easy endurance",
    },
    {
      key: "bike_threshold_sweet_spot",
      sport: "bike",
      label: "Bike threshold or sweet spot",
    },
    {
      key: "bike_long_endurance",
      sport: "bike",
      label: "Bike long endurance",
    },
    {
      key: "bike_high_intensity_climbing",
      sport: "bike",
      label: "Bike high intensity or climbing",
    },
  ];

export const FIRST_WAVE_GATED_PLAN_NAMES = [
  "Marathon Foundation (12 weeks)",
  "Half Marathon Build (10 weeks)",
  "5K Speed Block (8 weeks)",
  "Cycling Endurance Builder (12 weeks)",
] as const;

export const AUDIT_ONLY_PLAN_NAMES = [
  "Sprint Triathlon Base (10 weeks)",
  "General Fitness Maintenance (6 weeks)",
] as const;

const auditOnlyPlanNameSet = new Set<string>(AUDIT_ONLY_PLAN_NAMES);

export function getSystemTrainingPlanGateScope(
  planName: string,
): SystemTrainingPlanGateScope {
  return auditOnlyPlanNameSet.has(planName) ? "audit-only" : "first-wave";
}
