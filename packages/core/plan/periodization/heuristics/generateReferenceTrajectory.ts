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
import type { PlanningSport } from "../../../schemas/sport";
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
  currentCtl: number;
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

function resolvePlanningSport(demands: EventDemand[]): PlanningSport {
  if (demands.length === 0) {
    return "mixed";
  }

  const firstSport = demands[0]?.sport;
  if (demands.every((demand) => demand.sport === firstSport)) {
    return firstSport ?? "mixed";
  }

  return "mixed";
}

function resolveGoalPeakCtl(
  currentCtl: number,
  startDate: string,
  goalDate: string,
  requiredPeakCtl: number,
  constraintProfile: ResolvedConstraintProfile,
  mode: TrajectoryMode,
): number {
  if (mode === "target_seeking") {
    return round(requiredPeakCtl);
  }

  const weeksToGoal = Math.max(1 / 7, diffDays(startDate, goalDate) / 7);
  const achievable = currentCtl + constraintProfile.effective_max_ctl_ramp_per_week * weeksToGoal;
  return round(Math.min(requiredPeakCtl, achievable));
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
  targetCtl: number,
  sport: Exclude<PlanningSport, "mixed">,
  goalIds: string[],
  rationaleCodes: string[],
) {
  const eventPoint = buildBaselineSegment({
    startDate: eventDate,
    endDate: eventDate,
    startCtl: targetCtl,
    endCtl: targetCtl,
    phase: "event",
    sport,
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
        sport: demand.sport,
        targetCtl: resolveGoalPeakCtl(
          input.currentCtl,
          input.startDate,
          goal.target_date,
          demand.required_peak_ctl,
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
  currentCtl: number,
  sport: Exclude<PlanningSport, "mixed">,
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
      startCtl: currentCtl,
      endCtl: round(currentCtl * 0.92),
      phase: "recovery",
      sport,
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
        startCtl: round(currentCtl * 0.92),
        endCtl: round(currentCtl * 0.92),
        phase: "maintenance",
        sport,
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
  currentCtl: number,
  endDate: string,
): { nextDate: string; nextCtl: number } {
  const sport = window.sport;
  const taperStart = clampDate(addDays(window.goalDate, -window.taperDays), currentDate, endDate);

  appendPoints(
    points,
    buildBaselineSegment({
      startDate: currentDate,
      endDate: taperStart,
      startCtl: currentCtl,
      endCtl: window.targetCtl,
      phase: currentDate === taperStart ? "build" : "build",
      sport,
      excludeStart: points.length > 0,
      rationaleCodes: [...window.rationale_codes, "reverse_peak_anchor_applied"],
    }),
  );

  if (window.strategy === "sustained_peak" && window.secondaryGoalDate) {
    const firstEventCtl = round(window.targetCtl * 0.96);
    appendPoints(
      points,
      buildBaselineSegment({
        startDate: taperStart,
        endDate: addDays(window.goalDate, -1),
        startCtl: window.targetCtl,
        endCtl: firstEventCtl,
        phase: "taper",
        sport,
        excludeStart: true,
        goalIdsInEffect: window.goalIds,
        rationaleCodes: [...window.rationale_codes, "sustained_peak_first_taper"],
      }),
    );
    pushEventPoint(points, window.goalDate, firstEventCtl, sport, window.goalIds, [
      ...window.rationale_codes,
      "sustained_peak_first_event",
    ]);

    const secondaryTaperStart = clampDate(
      addDays(window.secondaryGoalDate, -(window.secondaryTaperDays ?? window.taperDays)),
      addDays(window.goalDate, 1),
      endDate,
    );
    const sustainedFloor = round(window.targetCtl * (window.sustainedPeakFloorFraction ?? 0.9));
    const sustainedBridgeStart = addDays(window.goalDate, 1);

    if (sustainedBridgeStart <= secondaryTaperStart) {
      appendPoints(
        points,
        buildBaselineSegment({
          startDate: sustainedBridgeStart,
          endDate: secondaryTaperStart,
          startCtl: Math.max(firstEventCtl, sustainedFloor),
          endCtl: Math.max(window.secondaryTargetCtl ?? window.targetCtl, sustainedFloor),
          phase: "maintenance",
          sport,
          excludeStart: false,
          goalIdsInEffect: window.goalIds,
          rationaleCodes: [...window.rationale_codes, "sustained_peak_bridge_segment"],
        }),
      );
    }

    const secondTargetCtl = round((window.secondaryTargetCtl ?? window.targetCtl) * 0.96);
    appendPoints(
      points,
      buildBaselineSegment({
        startDate: secondaryTaperStart,
        endDate: addDays(window.secondaryGoalDate, -1),
        startCtl: Math.max(window.secondaryTargetCtl ?? window.targetCtl, sustainedFloor),
        endCtl: secondTargetCtl,
        phase: "taper",
        sport,
        excludeStart: true,
        goalIdsInEffect: window.goalIds,
        rationaleCodes: [...window.rationale_codes, "sustained_peak_second_taper"],
      }),
    );
    pushEventPoint(points, window.secondaryGoalDate, secondTargetCtl, sport, window.goalIds, [
      ...window.rationale_codes,
      "sustained_peak_second_event",
    ]);

    return {
      nextDate: addDays(window.secondaryGoalDate, 1),
      nextCtl: secondTargetCtl,
    };
  }

  const taperEndCtl = round(window.targetCtl * (window.localFlattenFraction ?? 0.94));

  appendPoints(
    points,
    buildBaselineSegment({
      startDate: taperStart,
      endDate: addDays(window.goalDate, -1),
      startCtl: window.targetCtl,
      endCtl: taperEndCtl,
      phase: "taper",
      sport,
      excludeStart: true,
      goalIdsInEffect: window.goalIds,
      rationaleCodes: [...window.rationale_codes, `${window.strategy}_taper_segment`],
    }),
  );
  pushEventPoint(points, window.goalDate, taperEndCtl, sport, window.goalIds, [
    ...window.rationale_codes,
    `${window.strategy}_event_point`,
  ]);

  return {
    nextDate: addDays(window.goalDate, 1),
    nextCtl: taperEndCtl,
  };
}

export function generateReferenceTrajectory(
  input: GenerateReferenceTrajectoryInput,
): ReferenceTrajectory {
  const sport = resolvePlanningSport(input.resolvedDemands);
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
      sport,
      points: buildBaselineSegment({
        startDate: input.startDate,
        endDate: input.endDate,
        startCtl: input.currentCtl,
        endCtl: input.currentCtl,
        phase: "maintenance",
        sport: sport === "mixed" ? "other" : sport,
        rationaleCodes: [...input.feasibility.rationale_codes, "no_goal_maintenance_baseline"],
      }),
      feasibility: input.feasibility,
      calculated_parameters: calculatedParameters,
    });
  }

  const points: ReferenceTrajectoryPoint[] = [];
  let cursorDate = input.startDate;
  let cursorCtl = input.currentCtl;

  for (const goalWindow of mergedGoals) {
    if (goalWindow.goalDate < input.startDate || goalWindow.goalDate > input.endDate) {
      continue;
    }

    const rendered = renderMergedGoalWindow(
      points,
      goalWindow,
      cursorDate,
      cursorCtl,
      input.endDate,
    );
    cursorDate = rendered.nextDate;
    cursorCtl = rendered.nextCtl;
  }

  addRecoveryTail(
    points,
    cursorDate,
    input.endDate,
    cursorCtl,
    sport === "mixed" ? "other" : sport,
  );

  return referenceTrajectorySchema.parse({
    mode: input.mode,
    sport,
    points,
    feasibility: input.feasibility,
    calculated_parameters: calculatedParameters,
  });
}
