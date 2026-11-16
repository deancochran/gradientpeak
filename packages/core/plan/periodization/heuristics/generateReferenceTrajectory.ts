import type { CanonicalActivityCategory } from "../../../schemas/activity-category";
import {
  type EventDemand,
  type FeasibilityAssessment,
  type NormalizedPlanningGoal,
  type ReferenceTrajectory,
  type ReferenceTrajectoryPoint,
  referenceTrajectorySchema,
  type TrajectoryMode,
} from "../../../schemas/planning";
import type { AthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import { buildBaselineSegment } from "./buildBaselineSegment";
import { computeTaperWindow } from "./computeTaperWindow";
import {
  type GoalTrajectoryCandidate,
  type MergedGoalTrajectory,
  mergeGoalTrajectories,
} from "./mergeGoalTrajectories";
import type { ResolvedConstraintProfile } from "./resolveConstraintProfile";

export interface GenerateReferenceTrajectoryInput {
  startDate: string;
  endDate: string;
  currentLongTermLoad: number;
  goals: NormalizedPlanningGoal[];
  resolvedDemands: EventDemand[];
  preferenceProfile: AthletePreferenceProfile;
  constraintProfile: ResolvedConstraintProfile;
  feasibility: FeasibilityAssessment;
  mode: TrajectoryMode;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function diffDays(startDate: string, endDate: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86400000,
    ),
  );
}

function clampDate(date: string, startDate: string, endDate: string): string {
  if (date < startDate) {
    return startDate;
  }

  if (date > endDate) {
    return endDate;
  }

  return date;
}

function resolvePlanningActivityCategory(demands: EventDemand[]): CanonicalActivityCategory {
  if (demands.length === 0) {
    return "other";
  }

  const firstActivityCategory = demands[0]?.activity_category;
  if (demands.every((demand) => demand.activity_category === firstActivityCategory)) {
    return firstActivityCategory ?? "other";
  }

  return "other";
}

function resolveGoalPeakLongTermLoad(
  currentLongTermLoad: number,
  startDate: string,
  goalDate: string,
  requiredPeakLongTermLoad: number,
  constraintProfile: ResolvedConstraintProfile,
  mode: TrajectoryMode,
): number {
  if (mode === "target_seeking") {
    return round(requiredPeakLongTermLoad);
  }

  const weeksToGoal = Math.max(1 / 7, diffDays(startDate, goalDate) / 7);
  const achievable =
    currentLongTermLoad + constraintProfile.effective_max_longTermLoad_ramp_per_week * weeksToGoal;
  return round(Math.min(requiredPeakLongTermLoad, achievable));
}

function appendPoints(points: ReferenceTrajectoryPoint[], additions: ReferenceTrajectoryPoint[]) {
  for (const point of additions) {
    const previous = points[points.length - 1];

    if (!previous || previous.date !== point.date) {
      points.push(point);
    }
  }
}

function pushEventPoint(
  points: ReferenceTrajectoryPoint[],
  eventDate: string,
  targetLongTermLoad: number,
  activity_category: CanonicalActivityCategory,
  goalIds: string[],
  rationaleCodes: string[],
) {
  const eventPoint = buildBaselineSegment({
    startDate: eventDate,
    endDate: eventDate,
    startLongTermLoad: targetLongTermLoad,
    endLongTermLoad: targetLongTermLoad,
    phase: "event",
    activity_category,
    goalIdsInEffect: goalIds,
    rationaleCodes,
  })[0];

  if (eventPoint) {
    appendPoints(points, [eventPoint]);
  }
}

function buildCandidates(input: GenerateReferenceTrajectoryInput): GoalTrajectoryCandidate[] {
  return input.resolvedDemands.flatMap((demand) => {
    const goal = input.goals.find((item) => item.id === demand.goal_id);

    if (!goal) {
      return [];
    }

    const taper = computeTaperWindow(demand, input.preferenceProfile);

    return [
      {
        goal,
        demand,
        activity_category: demand.activity_category,
        targetLongTermLoad: resolveGoalPeakLongTermLoad(
          input.currentLongTermLoad,
          input.startDate,
          goal.target_date,
          demand.required_peak_longTermLoad,
          input.constraintProfile,
          input.mode,
        ),
        taperDays: taper.days,
        taperParameter: taper.parameter,
      },
    ];
  });
}

function addRecoveryTail(
  points: ReferenceTrajectoryPoint[],
  currentDate: string,
  endDate: string,
  currentLongTermLoad: number,
  activity_category: CanonicalActivityCategory,
) {
  if (currentDate > endDate) {
    return;
  }

  const recoveryEndDate = clampDate(addDays(currentDate, 4), currentDate, endDate);
  appendPoints(
    points,
    buildBaselineSegment({
      startDate: currentDate,
      endDate: recoveryEndDate,
      startLongTermLoad: currentLongTermLoad,
      endLongTermLoad: round(currentLongTermLoad * 0.92),
      phase: "recovery",
      activity_category,
      excludeStart: points.length > 0,
      rationaleCodes: ["post_goal_recovery_segment"],
    }),
  );

  if (recoveryEndDate < endDate) {
    appendPoints(
      points,
      buildBaselineSegment({
        startDate: recoveryEndDate,
        endDate,
        startLongTermLoad: round(currentLongTermLoad * 0.92),
        endLongTermLoad: round(currentLongTermLoad * 0.92),
        phase: "maintenance",
        activity_category,
        excludeStart: true,
        rationaleCodes: ["post_goal_maintenance_segment"],
      }),
    );
  }
}

function renderMergedGoalWindow(
  points: ReferenceTrajectoryPoint[],
  window: MergedGoalTrajectory,
  currentDate: string,
  currentLongTermLoad: number,
  endDate: string,
): { nextDate: string; nextLongTermLoad: number } {
  const activity_category = window.activity_category;
  const taperStart = clampDate(addDays(window.goalDate, -window.taperDays), currentDate, endDate);

  appendPoints(
    points,
    buildBaselineSegment({
      startDate: currentDate,
      endDate: taperStart,
      startLongTermLoad: currentLongTermLoad,
      endLongTermLoad: window.targetLongTermLoad,
      phase: currentDate === taperStart ? "build" : "build",
      activity_category,
      excludeStart: points.length > 0,
      rationaleCodes: [...window.rationale_codes, "reverse_peak_anchor_applied"],
    }),
  );

  if (window.strategy === "sustained_peak" && window.secondaryGoalDate) {
    const firstEventLongTermLoad = round(window.targetLongTermLoad * 0.96);
    appendPoints(
      points,
      buildBaselineSegment({
        startDate: taperStart,
        endDate: addDays(window.goalDate, -1),
        startLongTermLoad: window.targetLongTermLoad,
        endLongTermLoad: firstEventLongTermLoad,
        phase: "taper",
        activity_category,
        excludeStart: true,
        goalIdsInEffect: window.goalIds,
        rationaleCodes: [...window.rationale_codes, "sustained_peak_first_taper"],
      }),
    );
    pushEventPoint(
      points,
      window.goalDate,
      firstEventLongTermLoad,
      activity_category,
      window.goalIds,
      [...window.rationale_codes, "sustained_peak_first_event"],
    );

    const secondaryTaperStart = clampDate(
      addDays(window.secondaryGoalDate, -(window.secondaryTaperDays ?? window.taperDays)),
      addDays(window.goalDate, 1),
      endDate,
    );
    const sustainedFloor = round(
      window.targetLongTermLoad * (window.sustainedPeakFloorFraction ?? 0.9),
    );
    const sustainedBridgeStart = addDays(window.goalDate, 1);

    if (sustainedBridgeStart <= secondaryTaperStart) {
      appendPoints(
        points,
        buildBaselineSegment({
          startDate: sustainedBridgeStart,
          endDate: secondaryTaperStart,
          startLongTermLoad: Math.max(firstEventLongTermLoad, sustainedFloor),
          endLongTermLoad: Math.max(
            window.secondaryTargetLongTermLoad ?? window.targetLongTermLoad,
            sustainedFloor,
          ),
          phase: "maintenance",
          activity_category,
          excludeStart: false,
          goalIdsInEffect: window.goalIds,
          rationaleCodes: [...window.rationale_codes, "sustained_peak_bridge_segment"],
        }),
      );
    }

    const secondTargetLongTermLoad = round(
      (window.secondaryTargetLongTermLoad ?? window.targetLongTermLoad) * 0.96,
    );
    appendPoints(
      points,
      buildBaselineSegment({
        startDate: secondaryTaperStart,
        endDate: addDays(window.secondaryGoalDate, -1),
        startLongTermLoad: Math.max(
          window.secondaryTargetLongTermLoad ?? window.targetLongTermLoad,
          sustainedFloor,
        ),
        endLongTermLoad: secondTargetLongTermLoad,
        phase: "taper",
        activity_category,
        excludeStart: true,
        goalIdsInEffect: window.goalIds,
        rationaleCodes: [...window.rationale_codes, "sustained_peak_second_taper"],
      }),
    );
    pushEventPoint(
      points,
      window.secondaryGoalDate,
      secondTargetLongTermLoad,
      activity_category,
      window.goalIds,
      [...window.rationale_codes, "sustained_peak_second_event"],
    );

    return {
      nextDate: addDays(window.secondaryGoalDate, 1),
      nextLongTermLoad: secondTargetLongTermLoad,
    };
  }

  const taperEndLongTermLoad = round(
    window.targetLongTermLoad * (window.localFlattenFraction ?? 0.94),
  );

  appendPoints(
    points,
    buildBaselineSegment({
      startDate: taperStart,
      endDate: addDays(window.goalDate, -1),
      startLongTermLoad: window.targetLongTermLoad,
      endLongTermLoad: taperEndLongTermLoad,
      phase: "taper",
      activity_category,
      excludeStart: true,
      goalIdsInEffect: window.goalIds,
      rationaleCodes: [...window.rationale_codes, `${window.strategy}_taper_segment`],
    }),
  );
  pushEventPoint(points, window.goalDate, taperEndLongTermLoad, activity_category, window.goalIds, [
    ...window.rationale_codes,
    `${window.strategy}_event_point`,
  ]);

  return {
    nextDate: addDays(window.goalDate, 1),
    nextLongTermLoad: taperEndLongTermLoad,
  };
}

export function generateReferenceTrajectory(
  input: GenerateReferenceTrajectoryInput,
): ReferenceTrajectory {
  const activity_category = resolvePlanningActivityCategory(input.resolvedDemands);
  const candidates = buildCandidates(input);
  const mergedGoals = mergeGoalTrajectories(candidates, input.mode);
  const calculatedParameters = {
    ...input.constraintProfile.calculated_parameters,
    ...Object.fromEntries(
      candidates.map((goal) => [`taper_days_${goal.goal.id}`, goal.taperParameter]),
    ),
    ...Object.fromEntries(
      mergedGoals.map((goal) => [`taper_days_${goal.goalIds[0]}`, goal.taperParameter]),
    ),
  };

  if (mergedGoals.length === 0) {
    return referenceTrajectorySchema.parse({
      mode: input.mode,
      activity_category,
      points: buildBaselineSegment({
        startDate: input.startDate,
        endDate: input.endDate,
        startLongTermLoad: input.currentLongTermLoad,
        endLongTermLoad: input.currentLongTermLoad,
        phase: "maintenance",
        activity_category,
        rationaleCodes: [...input.feasibility.rationale_codes, "no_goal_maintenance_baseline"],
      }),
      feasibility: input.feasibility,
      calculated_parameters: calculatedParameters,
    });
  }

  const points: ReferenceTrajectoryPoint[] = [];
  let cursorDate = input.startDate;
  let cursorLongTermLoad = input.currentLongTermLoad;

  for (const goalWindow of mergedGoals) {
    if (goalWindow.goalDate < input.startDate || goalWindow.goalDate > input.endDate) {
      continue;
    }

    const rendered = renderMergedGoalWindow(
      points,
      goalWindow,
      cursorDate,
      cursorLongTermLoad,
      input.endDate,
    );
    cursorDate = rendered.nextDate;
    cursorLongTermLoad = rendered.nextLongTermLoad;
  }

  addRecoveryTail(points, cursorDate, input.endDate, cursorLongTermLoad, activity_category);

  return referenceTrajectorySchema.parse({
    mode: input.mode,
    activity_category,
    points,
    feasibility: input.feasibility,
    calculated_parameters: calculatedParameters,
  });
}
