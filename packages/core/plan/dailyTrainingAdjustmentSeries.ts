import { z } from "zod";
import { dateOnlySchema } from "../schemas/date-only";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";

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
    plannedLoad: finiteNumberSchema.nullable(),
    completedLoad: finiteNumberSchema.nullable(),
    targetLoad: finiteNumberSchema.nullable(),
    actualOrScheduledLoad: finiteNumberSchema.nullable(),
    loadDeltaLoad: finiteNumberSchema.nullable(),
    plannedDeltaLoad: finiteNumberSchema.nullable(),
    fitnessLongTermLoad: finiteNumberSchema.nullable().optional(),
    targetFitnessLongTermLoad: finiteNumberSchema.nullable().optional(),
    scheduledFitnessLongTermLoad: finiteNumberSchema.nullable().optional(),
    fatigueRecentLoad: finiteNumberSchema.nullable().optional(),
    formLoadBalance: finiteNumberSchema.nullable().optional(),
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
  plannedLoadByDate?: DateNumberInput;
  completedLoadByDate?: DateNumberInput;
  targetLoadByDate?: DateNumberInput;
  actualOrScheduledLoadByDate?: DateNumberInput;
  fitnessLongTermLoadByDate?: DateNumberInput;
  targetFitnessLongTermLoadByDate?: DateNumberInput;
  scheduledFitnessLongTermLoadByDate?: DateNumberInput;
  fatigueRecentLoadByDate?: DateNumberInput;
  formLoadBalanceByDate?: DateNumberInput;
  readinessScoreByDate?: DateNumberInput;
  annotationsByDate?: DateAnnotationsInput;
  sourceByDate?: DateSourceInput;
};

function readNumber(input: DateNumberInput | undefined, date: string): number | null {
  const value = isReadonlyMap(input) ? input.get(date) : input?.[date];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProvidedNumber(
  input: DateNumberInput | undefined,
  date: string,
): { provided: boolean; value: number | null } {
  const provided = isReadonlyMap(input)
    ? input.has(date)
    : input !== undefined && Object.hasOwn(input, date);
  return { provided, value: readNumber(input, date) };
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
  return input !== undefined && "get" in input && typeof input.get === "function";
}

function optionalMetric(value: number | null) {
  return value === null ? undefined : value;
}

function deriveLoad(
  values: readonly (number | null)[],
  calculation: (...knownValues: number[]) => number,
): number | null {
  return values.some((value) => value === null)
    ? null
    : calculation(...values.filter((value): value is number => value !== null));
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
    const plannedLoad = readNumber(input.plannedLoadByDate, date);
    const completedLoad = readNumber(input.completedLoadByDate, date);
    const targetLoad = readNumber(input.targetLoadByDate, date);
    const providedActualOrScheduledLoad = readProvidedNumber(
      input.actualOrScheduledLoadByDate,
      date,
    );
    const actualOrScheduledLoad = providedActualOrScheduledLoad.provided
      ? providedActualOrScheduledLoad.value
      : deriveLoad(
          [plannedLoad, completedLoad],
          (planned, completed) => completed + Math.max(0, planned - completed),
        );

    return trainingAdjustmentDailyPointSchema.parse({
      date,
      plannedLoad,
      completedLoad,
      targetLoad,
      actualOrScheduledLoad,
      loadDeltaLoad: deriveLoad(
        [actualOrScheduledLoad, targetLoad],
        (actualOrScheduled, target) => actualOrScheduled - target,
      ),
      plannedDeltaLoad: deriveLoad(
        [plannedLoad, targetLoad],
        (planned, target) => planned - target,
      ),
      fitnessLongTermLoad: optionalMetric(readNumber(input.fitnessLongTermLoadByDate, date)),
      targetFitnessLongTermLoad: optionalMetric(
        readNumber(input.targetFitnessLongTermLoadByDate, date),
      ),
      scheduledFitnessLongTermLoad: optionalMetric(
        readNumber(input.scheduledFitnessLongTermLoadByDate, date),
      ),
      fatigueRecentLoad: optionalMetric(readNumber(input.fatigueRecentLoadByDate, date)),
      formLoadBalance: optionalMetric(readNumber(input.formLoadBalanceByDate, date)),
      readinessScore: optionalMetric(readNumber(input.readinessScoreByDate, date)),
      annotations: readAnnotations(input.annotationsByDate, date),
      source: readSource(input.sourceByDate, date),
    });
  });
}
