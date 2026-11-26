import { z } from "zod";

import {
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "./schemas/training-plan-structure";

export const TRAINING_PLAN_PREVIEW_MAX_WEEKS = 104;

/**
 * A schedule-level training-plan preview. Chart height represents only the number
 * of planned sessions in each week.
 */
export const trainingPlanPlannedSchedulePreviewSchema = z
  .strictObject({
    scope: z.literal("weekly_session_count"),
    weeks: z
      .array(
        z.strictObject({
          weekIndex: z
            .number()
            .int()
            .min(0)
            .max(TRAINING_PLAN_PREVIEW_MAX_WEEKS - 1),
          plannedSessionCount: z.number().int().nonnegative().max(10_000),
        }),
      )
      .min(1)
      .max(TRAINING_PLAN_PREVIEW_MAX_WEEKS),
  })
  .superRefine((preview, context) => {
    for (let index = 0; index < preview.weeks.length; index += 1) {
      if (preview.weeks[index]?.weekIndex !== index) {
        context.addIssue({
          code: "custom",
          path: ["weeks", index, "weekIndex"],
          message: "Training-plan preview weeks must be contiguous and zero-based",
        });
      }
    }
  });
export type TrainingPlanPlannedSchedulePreview = z.infer<
  typeof trainingPlanPlannedSchedulePreviewSchema
>;

/** Derives bounded weekly session counts as a schedule distribution. */
export function deriveTrainingPlanPlannedSchedulePreview(
  structure: unknown,
): TrainingPlanPlannedSchedulePreview | null {
  const direct = canonicalTrainingPlanStructureSchema.safeParse(structure);
  const persisted = direct.success
    ? direct
    : persistedTrainingPlanStructureSchema.safeParse(structure);
  const nested =
    !persisted.success && structure && typeof structure === "object" && !Array.isArray(structure)
      ? canonicalTrainingPlanStructureSchema.safeParse(
          (structure as Record<string, unknown>).structure,
        )
      : persisted;
  if (!nested.success || nested.data.sessions.length === 0) return null;

  const lastScheduledWeek = Math.max(
    ...nested.data.sessions.map((session) => Math.floor(session.offset_days / 7)),
  );
  const recommendedWeeks = nested.data.durationWeeks?.recommended ?? 0;
  const weekCount = Math.max(lastScheduledWeek + 1, recommendedWeeks);
  if (weekCount < 1 || weekCount > TRAINING_PLAN_PREVIEW_MAX_WEEKS) return null;

  const counts = Array.from({ length: weekCount }, () => 0);
  for (const session of nested.data.sessions) {
    const weekIndex = Math.floor(session.offset_days / 7);
    if (weekIndex < 0 || weekIndex >= weekCount) return null;
    counts[weekIndex] = (counts[weekIndex] ?? 0) + 1;
  }
  return trainingPlanPlannedSchedulePreviewSchema.parse({
    scope: "weekly_session_count",
    weeks: counts.map((plannedSessionCount, weekIndex) => ({
      weekIndex,
      plannedSessionCount,
    })),
  });
}

export type ProfileChartInputPoint = Readonly<{ position: number; value: number }>;
export type ProfileChartPoint = Readonly<{ x: number; y: number }>;

/** Shared, runtime-neutral chart projection used by web and native SVG renderers. */
export function projectProfileChartPoints(
  samples: readonly ProfileChartInputPoint[],
  options: Readonly<{
    width?: number;
    height?: number;
    padding?: number;
    valueMinimum?: number;
    valueMaximum?: number;
  }> = {},
): ProfileChartPoint[] {
  if (samples.length === 0) return [];
  if (
    samples.some(
      (sample, index) =>
        !Number.isFinite(sample.position) ||
        !Number.isFinite(sample.value) ||
        (index > 0 && sample.position < (samples[index - 1]?.position ?? sample.position)),
    )
  ) {
    return [];
  }

  const width = options.width ?? 100;
  const height = options.height ?? 48;
  const padding = options.padding ?? 4;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(padding)) return [];
  if (width <= padding * 2 || height <= padding * 2 || padding < 0) return [];

  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return [];
  const values = samples.map((sample) => sample.value);
  const valueMinimum = options.valueMinimum ?? Math.min(...values);
  const valueMaximum = options.valueMaximum ?? Math.max(...values);
  if (!Number.isFinite(valueMinimum) || !Number.isFinite(valueMaximum)) return [];
  const positionRange = last.position - first.position;
  const valueRange = valueMaximum - valueMinimum;
  return samples.map((sample) => ({
    x:
      positionRange === 0
        ? width / 2
        : padding + ((sample.position - first.position) / positionRange) * (width - padding * 2),
    y:
      valueRange === 0
        ? height / 2
        : height - padding - ((sample.value - valueMinimum) / valueRange) * (height - padding * 2),
  }));
}

export function serializeProfileChartPoints(points: readonly ProfileChartPoint[]): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}
