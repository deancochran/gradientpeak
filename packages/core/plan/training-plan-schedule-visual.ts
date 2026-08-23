import { z } from "zod";
import {
  deriveTrainingPlanPlannedSchedulePreview,
  trainingPlanPlannedSchedulePreviewSchema,
} from "../profile-previews";
import {
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "../schemas/training-plan-structure";

export const trainingPlanScheduleVisualWeekSchema = z.strictObject({
  hasAuthoredGoal: z.boolean(),
  plannedSessionCount: z.number().int().nonnegative().max(10_000),
  relativeSessionVolume: z.number().min(0).max(1),
  weekIndex: z.number().int().min(0).max(103),
});

/**
 * A presentation-neutral view of the authored schedule. It deliberately has no
 * training phase, activity intensity, or athlete-specific load fields because a
 * training-plan structure does not author those facts.
 */
export const trainingPlanScheduleVisualModelSchema = z.strictObject({
  maxSessionsPerWeek: z.number().int().positive().max(10_000),
  scope: z.literal("weekly_session_distribution"),
  totalSessions: z.number().int().positive().max(1_040_000),
  totalWeeks: z.number().int().min(1).max(104),
  weeks: z.array(trainingPlanScheduleVisualWeekSchema).min(1).max(104),
});

export type TrainingPlanScheduleVisualWeek = z.infer<typeof trainingPlanScheduleVisualWeekSchema>;
export type TrainingPlanScheduleVisualModel = z.infer<typeof trainingPlanScheduleVisualModelSchema>;

type TrainingPlanScheduleVisualInput = Readonly<{
  preview?: unknown;
  structure?: unknown;
}>;

function parseStructure(structure: unknown) {
  const canonical = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (canonical.success) return canonical.data;

  const persisted = persistedTrainingPlanStructureSchema.safeParse(structure);
  return persisted.success ? persisted.data : null;
}

/** Builds the same bounded, deterministic schedule visual model for every UI surface. */
export function deriveTrainingPlanScheduleVisual(
  input: TrainingPlanScheduleVisualInput,
): TrainingPlanScheduleVisualModel | null {
  const suppliedPreview = trainingPlanPlannedSchedulePreviewSchema.safeParse(input.preview);
  const preview = suppliedPreview.success
    ? suppliedPreview.data
    : deriveTrainingPlanPlannedSchedulePreview(input.structure);
  if (!preview) return null;

  const totalSessions = preview.weeks.reduce((total, week) => total + week.plannedSessionCount, 0);
  if (totalSessions === 0) return null;

  const structure = parseStructure(input.structure);
  const maxSessionsPerWeek = Math.max(1, ...preview.weeks.map((week) => week.plannedSessionCount));
  const goalWeeks = new Set(
    (structure?.goal_blueprints ?? []).flatMap((goal) =>
      goal.target_offset_days === undefined ? [] : [Math.floor(goal.target_offset_days / 7)],
    ),
  );

  return trainingPlanScheduleVisualModelSchema.parse({
    maxSessionsPerWeek,
    scope: "weekly_session_distribution",
    totalSessions,
    totalWeeks: preview.weeks.length,
    weeks: preview.weeks.map((week) => ({
      hasAuthoredGoal: goalWeeks.has(week.weekIndex),
      plannedSessionCount: week.plannedSessionCount,
      relativeSessionVolume: week.plannedSessionCount / maxSessionsPerWeek,
      weekIndex: week.weekIndex,
    })),
  });
}
