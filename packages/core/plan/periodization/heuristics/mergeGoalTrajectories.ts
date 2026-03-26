import type {
  CalculatedParameter,
  EventDemand,
  NormalizedPlanningGoal,
  PlanningGoalPriorityClass,
  TrajectoryMode,
} from "../../../schemas/planning";
import type { CanonicalSport } from "../../../schemas/sport";

const MICRO_TAPER_DAYS = 4;
const MICRO_TAPER_FLATTEN_FRACTION = 0.95;
const SUSTAINED_PEAK_WINDOW_DAYS = 21;
const CLOSE_BC_TO_A_WINDOW_DAYS = 35;
const SUSTAINED_PEAK_VALLEY_FLOOR_FRACTION = 0.9;

export interface GoalTrajectoryCandidate {
  goal: NormalizedPlanningGoal;
  demand: EventDemand;
  sport: CanonicalSport;
  targetCtl: number;
  taperDays: number;
  taperParameter: CalculatedParameter;
}

export type MergedGoalTrajectoryStrategy =
  | "independent"
  | "micro_taper"
  | "same_day_priority"
  | "sustained_peak";

export interface MergedGoalTrajectory {
  strategy: MergedGoalTrajectoryStrategy;
  sport: CanonicalSport;
  goalDate: string;
  goalIds: string[];
  priorityClass: PlanningGoalPriorityClass;
  targetCtl: number;
  taperDays: number;
  taperParameter: CalculatedParameter;
  rationale_codes: string[];
  secondaryGoalDate?: string;
  secondaryGoalIds?: string[];
  secondaryTargetCtl?: number;
  secondaryTaperDays?: number;
  sustainedPeakFloorFraction?: number;
  localFlattenFraction?: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function diffDays(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86400000,
  );
}

function compareCandidates(left: GoalTrajectoryCandidate, right: GoalTrajectoryCandidate) {
  if (left.goal.target_date !== right.goal.target_date) {
    return left.goal.target_date.localeCompare(right.goal.target_date);
  }

  if (left.goal.priority !== right.goal.priority) {
    return right.goal.priority - left.goal.priority;
  }

  if (left.targetCtl !== right.targetCtl) {
    return right.targetCtl - left.targetCtl;
  }

  return left.goal.id.localeCompare(right.goal.id);
}

function withReplacedTaper(
  parameter: CalculatedParameter,
  value: number,
  rationaleCodes: string[],
): CalculatedParameter {
  return {
    ...parameter,
    effective: value,
    clamped: parameter.clamped || value !== parameter.effective,
    modifiers: [
      ...parameter.modifiers,
      {
        source: "close_goal_merge",
        operation: "replace",
        value,
      },
    ],
    rationale_codes: [...parameter.rationale_codes, ...rationaleCodes],
  };
}

export function mergeGoalTrajectories(
  candidates: GoalTrajectoryCandidate[],
  mode: TrajectoryMode,
): MergedGoalTrajectory[] {
  const sameDayGroups = new Map<string, GoalTrajectoryCandidate[]>();

  for (const candidate of [...candidates].sort(compareCandidates)) {
    const key = candidate.goal.target_date;
    const group = sameDayGroups.get(key) ?? [];
    group.push(candidate);
    sameDayGroups.set(key, group);
  }

  const collapsed = [...sameDayGroups.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([, group]) => {
      const sortedGroup = [...group].sort(compareCandidates);
      const primary = sortedGroup[0]!;
      const goalIds = sortedGroup.map((item) => item.goal.id);

      return {
        strategy: sortedGroup.length > 1 ? "same_day_priority" : "independent",
        sport: primary.sport,
        goalDate: primary.goal.target_date,
        goalIds,
        priorityClass: primary.goal.priority_class,
        targetCtl: primary.targetCtl,
        taperDays: primary.taperDays,
        taperParameter: primary.taperParameter,
        rationale_codes:
          sortedGroup.length > 1
            ? [
                "same_day_goal_window_merged",
                primary.goal.priority_class === "A"
                  ? "same_day_uses_a_goal_demand_window"
                  : "same_day_uses_highest_priority_demand_window",
              ]
            : ["independent_goal_window"],
      } satisfies MergedGoalTrajectory;
    });

  const merged: MergedGoalTrajectory[] = [];

  for (let index = 0; index < collapsed.length; index += 1) {
    const current = collapsed[index]!;
    const next = collapsed[index + 1];

    if (
      next &&
      current.priorityClass === "A" &&
      next.priorityClass === "A" &&
      diffDays(current.goalDate, next.goalDate) <= SUSTAINED_PEAK_WINDOW_DAYS
    ) {
      merged.push({
        ...current,
        strategy: "sustained_peak",
        goalIds: [...current.goalIds, ...next.goalIds],
        targetCtl: round(Math.max(current.targetCtl, next.targetCtl)),
        rationale_codes: [...current.rationale_codes, "close_a_goal_sustained_peak_window_applied"],
        secondaryGoalDate: next.goalDate,
        secondaryGoalIds: next.goalIds,
        secondaryTargetCtl: next.targetCtl,
        secondaryTaperDays: next.taperDays,
        sustainedPeakFloorFraction: SUSTAINED_PEAK_VALLEY_FLOOR_FRACTION,
      });
      index += 1;
      continue;
    }

    if (
      next &&
      current.priorityClass !== "A" &&
      next.priorityClass === "A" &&
      diffDays(current.goalDate, next.goalDate) <= CLOSE_BC_TO_A_WINDOW_DAYS
    ) {
      merged.push({
        ...current,
        strategy: "micro_taper",
        taperDays: MICRO_TAPER_DAYS,
        taperParameter: withReplacedTaper(current.taperParameter, MICRO_TAPER_DAYS, [
          "close_b_or_c_before_a_micro_taper_applied",
        ]),
        rationale_codes: [...current.rationale_codes, "close_b_or_c_before_a_micro_taper_applied"],
        localFlattenFraction: MICRO_TAPER_FLATTEN_FRACTION,
      });
      continue;
    }

    merged.push(current);
  }

  return merged.map((item) => ({
    ...item,
    rationale_codes:
      mode === "capacity_bounded"
        ? [...item.rationale_codes, "capacity_bounded_goal_window"]
        : item.rationale_codes,
  }));
}
