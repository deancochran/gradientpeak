import type { z } from "zod";
import type { canonicalGoalObjectiveSchema } from "../schemas/goals/profile_goals";

type CanonicalGoalObjective = z.infer<typeof canonicalGoalObjectiveSchema>;

export type TrainingPlanStructureDriver =
  | "consistency-frequency"
  | "completion-duration"
  | "completion-distance"
  | "preference-frequency"
  | "starter-frequency";

export type TrainingPlanStructureProvenanceAttribute =
  | "goals"
  | "duration-weeks"
  | "weekly-session-count"
  | "starter-values"
  | "endurance-anchor";

export type TrainingPlanStructureProvenanceSource = "default" | "derived" | "goal" | "preference";

export type TrainingPlanSessionIntentType =
  | "endurance"
  | "recovery"
  | "threshold"
  | "general"
  | "test";

export interface TrainingPlanSessionIntent {
  type: TrainingPlanSessionIntentType;
  driver: TrainingPlanStructureDriver;
  targetDurationSeconds?: number;
  targetTss?: number;
}

export interface TrainingPlanStructureProvenanceRow {
  attribute: TrainingPlanStructureProvenanceAttribute;
  source: TrainingPlanStructureProvenanceSource;
  label: string;
  value: string;
  explanation: string;
  driver?: TrainingPlanStructureDriver;
}

export interface TrainingPlanStructureProposalGoal {
  objective: CanonicalGoalObjective | null;
}

export interface TrainingPlanStructureProposalPreferences {
  durationWeeks: number | null;
  weeklySessionCount: number | null;
}

export interface DeriveTrainingPlanStructureProposalInput {
  goals: TrainingPlanStructureProposalGoal[];
  preferences: TrainingPlanStructureProposalPreferences;
}

export interface TrainingPlanStructureProposalSession {
  offsetDays: number;
  label: string;
  driver: TrainingPlanStructureDriver;
  intent: TrainingPlanSessionIntent;
}

export interface TrainingPlanStructureProposal {
  durationWeeks: number;
  sessionsPerWeek: number;
  includesEnduranceAnchor: boolean;
  drivers: TrainingPlanStructureDriver[];
  provenance: TrainingPlanStructureProvenanceRow[];
  sessions: TrainingPlanStructureProposalSession[];
}

const DEFAULT_DURATION_WEEKS = 4;
const DEFAULT_SESSIONS_PER_WEEK = 3;

const WEEKLY_SLOT_PATTERNS: Record<number, number[]> = {
  1: [2],
  2: [1, 4],
  3: [1, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function uniqueDrivers(drivers: TrainingPlanStructureDriver[]) {
  return Array.from(new Set(drivers));
}

function getConsistencyHints(goals: TrainingPlanStructureProposalGoal[]) {
  return goals.reduce(
    (hints, goal) => {
      if (goal.objective?.type !== "consistency") {
        return hints;
      }

      return {
        sessionsPerWeek: Math.max(
          hints.sessionsPerWeek,
          goal.objective.target_sessions_per_week ?? 0,
        ),
        weeks: Math.max(hints.weeks, goal.objective.target_weeks ?? 0),
      };
    },
    { sessionsPerWeek: 0, weeks: 0 },
  );
}

function hasEnduranceCompletionGoal(goals: TrainingPlanStructureProposalGoal[]) {
  return goals.some((goal) => {
    if (goal.objective?.type !== "completion") {
      return false;
    }

    return (goal.objective.duration_s ?? 0) >= 3600 || (goal.objective.distance_m ?? 0) >= 10_000;
  });
}

function getCompletionDrivers(
  goals: TrainingPlanStructureProposalGoal[],
): TrainingPlanStructureDriver[] {
  return goals.flatMap((goal) => {
    if (goal.objective?.type !== "completion") {
      return [];
    }

    const drivers: TrainingPlanStructureDriver[] = [];
    if ((goal.objective.duration_s ?? 0) >= 3600) {
      drivers.push("completion-duration");
    }
    if ((goal.objective.distance_m ?? 0) >= 10_000) {
      drivers.push("completion-distance");
    }
    return drivers;
  });
}

function formatGoalSummary(goals: TrainingPlanStructureProposalGoal[]) {
  const counts = goals.reduce(
    (summary, goal) => {
      if (goal.objective?.type === "completion") {
        return { ...summary, completion: summary.completion + 1 };
      }
      if (goal.objective?.type === "consistency") {
        return { ...summary, consistency: summary.consistency + 1 };
      }
      if (goal.objective?.type === "event_performance") {
        return { ...summary, eventPerformance: summary.eventPerformance + 1 };
      }
      if (goal.objective?.type === "threshold") {
        return { ...summary, threshold: summary.threshold + 1 };
      }
      return summary;
    },
    { completion: 0, consistency: 0, eventPerformance: 0, threshold: 0 },
  );
  const parts = [
    counts.consistency > 0 ? `${counts.consistency} consistency` : null,
    counts.completion > 0 ? `${counts.completion} completion` : null,
    counts.eventPerformance > 0 ? `${counts.eventPerformance} event` : null,
    counts.threshold > 0 ? `${counts.threshold} threshold` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(", ") : "No selected goals";
}

function buildTrainingPlanStructureProvenance({
  baseDriver,
  consistencyHints,
  drivers,
  durationWeeks,
  goals,
  includesEnduranceAnchor,
  preferences,
  sessionsPerWeek,
}: {
  baseDriver: TrainingPlanStructureDriver;
  consistencyHints: ReturnType<typeof getConsistencyHints>;
  drivers: TrainingPlanStructureDriver[];
  durationWeeks: number;
  goals: TrainingPlanStructureProposalGoal[];
  includesEnduranceAnchor: boolean;
  preferences: TrainingPlanStructureProposalPreferences;
  sessionsPerWeek: number;
}): TrainingPlanStructureProvenanceRow[] {
  const durationSource: TrainingPlanStructureProvenanceSource =
    consistencyHints.weeks > 0
      ? "goal"
      : preferences.durationWeeks !== null
        ? "preference"
        : "default";
  const frequencySource: TrainingPlanStructureProvenanceSource =
    consistencyHints.sessionsPerWeek > 0
      ? "goal"
      : preferences.weeklySessionCount !== null
        ? "preference"
        : "default";
  const enduranceDrivers = drivers.filter(
    (driver) => driver === "completion-duration" || driver === "completion-distance",
  );

  return [
    {
      attribute: "goals",
      source: goals.length > 0 ? "goal" : "default",
      label: "Goals considered",
      value: formatGoalSummary(goals),
      explanation:
        goals.length > 0
          ? "Selected goal objectives were scanned for consistency targets and long completion anchors."
          : "No selected goal objective changed the starter structure.",
    },
    {
      attribute: "duration-weeks",
      source: durationSource,
      label: "Duration weeks",
      value: `${durationWeeks}`,
      explanation:
        durationSource === "goal"
          ? `Used the largest consistency target of ${consistencyHints.weeks} weeks, capped to the supported range.`
          : durationSource === "preference"
            ? `Used the requested ${preferences.durationWeeks} week preference, capped to the supported range.`
            : `Used the ${DEFAULT_DURATION_WEEKS} week starter duration.`,
    },
    {
      attribute: "weekly-session-count",
      source: frequencySource,
      label: "Weekly sessions",
      value: `${sessionsPerWeek}`,
      explanation:
        frequencySource === "goal"
          ? `Used the largest consistency target of ${consistencyHints.sessionsPerWeek} sessions per week, capped to the supported range.`
          : frequencySource === "preference"
            ? `Used the requested ${preferences.weeklySessionCount} sessions per week preference, capped to the supported range.`
            : `Used the ${DEFAULT_SESSIONS_PER_WEEK} sessions per week starter frequency.`,
      driver: baseDriver,
    },
    {
      attribute: "starter-values",
      source: baseDriver === "starter-frequency" ? "default" : "derived",
      label: "Session defaults",
      value: baseDriver === "consistency-frequency" ? "45 TSS / 45m" : "60 TSS / 60m",
      explanation:
        baseDriver === "consistency-frequency"
          ? "General sessions use lighter defaults when a consistency frequency goal drives the plan."
          : "General sessions use starter defaults when frequency is preference-driven or defaulted.",
      driver: baseDriver,
    },
    {
      attribute: "endurance-anchor",
      source: includesEnduranceAnchor ? "goal" : "derived",
      label: "Endurance anchor",
      value: includesEnduranceAnchor ? "Included" : "Not included",
      explanation: includesEnduranceAnchor
        ? `Long completion goal attributes triggered ${enduranceDrivers.join(" and ")} anchor drivers.`
        : "No completion goal met the one hour or 10 km endurance anchor threshold.",
      driver: enduranceDrivers[0],
    },
  ];
}

export function deriveTrainingPlanStructureProposal(
  input: DeriveTrainingPlanStructureProposalInput,
): TrainingPlanStructureProposal {
  const consistencyHints = getConsistencyHints(input.goals);
  const hasConsistencyFrequency = consistencyHints.sessionsPerWeek > 0;
  const hasPreferenceFrequency = input.preferences.weeklySessionCount !== null;
  const sessionsPerWeek = Math.max(
    1,
    Math.min(
      7,
      consistencyHints.sessionsPerWeek ||
        input.preferences.weeklySessionCount ||
        DEFAULT_SESSIONS_PER_WEEK,
    ),
  );
  const durationWeeks = Math.max(
    1,
    Math.min(
      52,
      consistencyHints.weeks || input.preferences.durationWeeks || DEFAULT_DURATION_WEEKS,
    ),
  );
  const includesEnduranceAnchor = hasEnduranceCompletionGoal(input.goals);
  const slotPattern = WEEKLY_SLOT_PATTERNS[sessionsPerWeek] ?? [0, 1, 2, 3, 4, 5, 6];
  const baseDriver: TrainingPlanStructureDriver = hasConsistencyFrequency
    ? "consistency-frequency"
    : hasPreferenceFrequency
      ? "preference-frequency"
      : "starter-frequency";
  const drivers = uniqueDrivers([baseDriver, ...getCompletionDrivers(input.goals)]);

  return {
    durationWeeks,
    sessionsPerWeek,
    includesEnduranceAnchor,
    drivers,
    provenance: buildTrainingPlanStructureProvenance({
      baseDriver,
      consistencyHints,
      drivers,
      durationWeeks,
      goals: input.goals,
      includesEnduranceAnchor,
      preferences: input.preferences,
      sessionsPerWeek,
    }),
    sessions: Array.from({ length: durationWeeks }).flatMap((_, weekIndex) =>
      slotPattern.map((weekdayOffset, sessionIndex) => {
        const isEnduranceAnchor =
          includesEnduranceAnchor && sessionIndex === slotPattern.length - 1;
        return {
          offsetDays: weekIndex * 7 + weekdayOffset,
          label: isEnduranceAnchor ? "Endurance focus" : "Training session",
          driver: isEnduranceAnchor ? (drivers.at(-1) ?? baseDriver) : baseDriver,
          intent: isEnduranceAnchor
            ? {
                type: "endurance" as const,
                driver: drivers.at(-1) ?? baseDriver,
                targetDurationSeconds: 5400,
                targetTss: 90,
              }
            : {
                type: hasConsistencyFrequency ? ("general" as const) : ("general" as const),
                driver: baseDriver,
                targetDurationSeconds: hasConsistencyFrequency ? 2700 : 3600,
                targetTss: hasConsistencyFrequency ? 45 : 60,
              },
        };
      }),
    ),
  };
}
