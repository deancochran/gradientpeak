import { z } from "zod";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finiteNumberSchema = z.number().finite();

export const trainingAdjustmentAnnotationSchema = z
  .object({
    code: z.string().trim().min(1),
    severity: z.enum(["info", "warning", "risk"]).default("info"),
    message: z.string().trim().min(1).optional(),
  })
  .strict();

export const trainingAdjustmentDailyPointSourceSchema = z
  .object({
    target: z.enum(["goal_projection", "plan_structure", "baseline", "local_estimate"]).optional(),
    planned: z.enum(["calendar", "builder", "none"]).optional(),
    completed: z.enum(["recorded_activity", "none"]).optional(),
  })
  .strict();

export const trainingAdjustmentDailyPointSchema = z
  .object({
    date: dateOnlySchema,
    plannedLoadTss: finiteNumberSchema.default(0),
    tentativePlannedLoadTss: finiteNumberSchema.default(0),
    completedLoadTss: finiteNumberSchema.default(0),
    targetLoadTss: finiteNumberSchema.default(0),
    actualOrScheduledLoadTss: finiteNumberSchema.default(0),
    loadDeltaTss: finiteNumberSchema.default(0),
    plannedDeltaTss: finiteNumberSchema.default(0),
    fitnessCtl: finiteNumberSchema.nullable().optional(),
    targetFitnessCtl: finiteNumberSchema.nullable().optional(),
    scheduledFitnessCtl: finiteNumberSchema.nullable().optional(),
    fatigueAtl: finiteNumberSchema.nullable().optional(),
    formTsb: finiteNumberSchema.nullable().optional(),
    readinessScore: finiteNumberSchema.nullable().optional(),
    annotations: z.array(trainingAdjustmentAnnotationSchema).default([]),
    source: trainingAdjustmentDailyPointSourceSchema.optional(),
  })
  .strict();

export type TrainingAdjustmentAnnotation = z.infer<typeof trainingAdjustmentAnnotationSchema>;
export type TrainingAdjustmentDailyPoint = z.infer<typeof trainingAdjustmentDailyPointSchema>;
export type TrainingAdjustmentDailyPointSource = z.infer<
  typeof trainingAdjustmentDailyPointSourceSchema
>;

type DateNumberInput =
  | Readonly<Record<string, number | null | undefined>>
  | ReadonlyMap<string, number | null | undefined>;
type DateAnnotationsInput =
  | Readonly<Record<string, readonly TrainingAdjustmentAnnotation[] | undefined>>
  | ReadonlyMap<string, readonly TrainingAdjustmentAnnotation[] | undefined>;
type DateSourceInput =
  | Readonly<Record<string, TrainingAdjustmentDailyPointSource | undefined>>
  | ReadonlyMap<string, TrainingAdjustmentDailyPointSource | undefined>;

export type BuildTrainingAdjustmentDailySeriesInput = {
  startDate: string;
  endDate: string;
  plannedLoadTssByDate?: DateNumberInput;
  tentativePlannedLoadTssByDate?: DateNumberInput;
  completedLoadTssByDate?: DateNumberInput;
  targetLoadTssByDate?: DateNumberInput;
  actualOrScheduledLoadTssByDate?: DateNumberInput;
  fitnessCtlByDate?: DateNumberInput;
  targetFitnessCtlByDate?: DateNumberInput;
  scheduledFitnessCtlByDate?: DateNumberInput;
  fatigueAtlByDate?: DateNumberInput;
  formTsbByDate?: DateNumberInput;
  readinessScoreByDate?: DateNumberInput;
  annotationsByDate?: DateAnnotationsInput;
  sourceByDate?: DateSourceInput;
};

function readNumber(input: DateNumberInput | undefined, date: string): number | null {
  const value = isReadonlyMap(input) ? input.get(date) : input?.[date];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLoad(input: DateNumberInput | undefined, date: string): number {
  return readNumber(input, date) ?? 0;
}

function readAnnotations(input: DateAnnotationsInput | undefined, date: string) {
  return [...(isReadonlyMap(input) ? (input.get(date) ?? []) : (input?.[date] ?? []))];
}

function readSource(input: DateSourceInput | undefined, date: string) {
  return isReadonlyMap(input) ? input.get(date) : input?.[date];
}

function isReadonlyMap<Value>(
  input: Readonly<Record<string, Value>> | ReadonlyMap<string, Value> | undefined,
): input is ReadonlyMap<string, Value> {
  return typeof (input as ReadonlyMap<string, Value> | undefined)?.get === "function";
}

function optionalMetric(value: number | null) {
  return value === null ? undefined : value;
}

export function buildTrainingAdjustmentDailySeries(
  input: BuildTrainingAdjustmentDailySeriesInput,
): TrainingAdjustmentDailyPoint[] {
  dateOnlySchema.parse(input.startDate);
  dateOnlySchema.parse(input.endDate);

  const dayCount = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) {
    return [];
  }

  return Array.from({ length: dayCount }, (_, dayIndex) => {
    const date = addDaysDateOnlyUtc(input.startDate, dayIndex);
    const plannedLoadTss = readLoad(input.plannedLoadTssByDate, date);
    const tentativePlannedLoadTss = readLoad(input.tentativePlannedLoadTssByDate, date);
    const completedLoadTss = readLoad(input.completedLoadTssByDate, date);
    const targetLoadTss = readLoad(input.targetLoadTssByDate, date);
    const actualOrScheduledLoadTss =
      readNumber(input.actualOrScheduledLoadTssByDate, date) ?? completedLoadTss + plannedLoadTss;

    return trainingAdjustmentDailyPointSchema.parse({
      date,
      plannedLoadTss,
      tentativePlannedLoadTss,
      completedLoadTss,
      targetLoadTss,
      actualOrScheduledLoadTss,
      loadDeltaTss: actualOrScheduledLoadTss - targetLoadTss,
      plannedDeltaTss: plannedLoadTss + tentativePlannedLoadTss - targetLoadTss,
      fitnessCtl: optionalMetric(readNumber(input.fitnessCtlByDate, date)),
      targetFitnessCtl: optionalMetric(readNumber(input.targetFitnessCtlByDate, date)),
      scheduledFitnessCtl: optionalMetric(readNumber(input.scheduledFitnessCtlByDate, date)),
      fatigueAtl: optionalMetric(readNumber(input.fatigueAtlByDate, date)),
      formTsb: optionalMetric(readNumber(input.formTsbByDate, date)),
      readinessScore: optionalMetric(readNumber(input.readinessScoreByDate, date)),
      annotations: readAnnotations(input.annotationsByDate, date),
      source: readSource(input.sourceByDate, date),
    });
  });
}
