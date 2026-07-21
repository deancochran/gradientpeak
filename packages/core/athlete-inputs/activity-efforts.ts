import { z } from "zod";
import { canonicalSportSchema } from "../schemas/sport";
import type { CanonicalEffortUnit } from "../units/effort";
import { ACTIVITY_EFFORT_HARD_BOUNDS } from "./activity-effort-policy";

export const activityEffortTypeSchema = z.enum(["power", "speed", "heart_rate"]);

export type ActivityEffortType = z.infer<typeof activityEffortTypeSchema>;
export type ActivityEffortCategory = z.infer<typeof canonicalSportSchema>;
export type ActivityEffortInputKind = "integer" | "decimal";

/**
 * Converts a completed distance and elapsed time to the canonical speed unit
 * used by activity efforts (meters per second).
 *
 * Form-safe invalid-input semantics: zero, negative, `NaN`, and infinite
 * distance or elapsed time return `null` rather than throwing or producing an
 * invalid numeric value.
 */
export function speedMetersPerSecondFromDistanceAndElapsedSeconds(input: {
  distanceMeters: number;
  elapsedSeconds: number;
}): number | null {
  const { distanceMeters, elapsedSeconds } = input;
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(elapsedSeconds) ||
    distanceMeters <= 0 ||
    elapsedSeconds <= 0
  ) {
    return null;
  }

  return distanceMeters / elapsedSeconds;
}

/**
 * Converts a pace expressed as seconds per distance unit to canonical meters
 * per second. For example, use `paceSeconds: 300` and
 * `distanceUnitMeters: 1_000` for a 5:00/km pace.
 *
 * Zero, negative, `NaN`, and infinite inputs return `null` for safe use while
 * a form is incomplete or invalid.
 */
export function speedMetersPerSecondFromPace(input: {
  paceSeconds: number;
  distanceUnitMeters: number;
}): number | null {
  return speedMetersPerSecondFromDistanceAndElapsedSeconds({
    distanceMeters: input.distanceUnitMeters,
    elapsedSeconds: input.paceSeconds,
  });
}

/**
 * Converts canonical meters per second to pace seconds per distance unit for
 * displaying an existing speed effort in a pace-based entry field. Invalid
 * speed or unit inputs return `null`.
 */
export function paceSecondsFromSpeedMetersPerSecond(input: {
  speedMetersPerSecond: number;
  distanceUnitMeters: number;
}): number | null {
  const { speedMetersPerSecond, distanceUnitMeters } = input;
  if (
    !Number.isFinite(speedMetersPerSecond) ||
    !Number.isFinite(distanceUnitMeters) ||
    speedMetersPerSecond <= 0 ||
    distanceUnitMeters <= 0
  ) {
    return null;
  }

  return distanceUnitMeters / speedMetersPerSecond;
}

export interface ActivityEffortDefinition {
  id: string;
  activityCategory: ActivityEffortCategory;
  effortType: ActivityEffortType;
  label: string;
  valueLabel: string;
  unit: string;
  storageUnit: CanonicalEffortUnit;
  inputKind: ActivityEffortInputKind;
  min: number;
  max: number;
  decimals: number;
  defaultValue: number;
  defaultDurationSeconds: number;
  durationPresets: number[];
}

export const activityEffortDefinitions = [
  {
    id: "bike_power",
    activityCategory: "bike",
    effortType: "power",
    label: "Bike power",
    valueLabel: "Power",
    unit: "W",
    storageUnit: "watts",
    inputKind: "integer",
    min: 1,
    max: ACTIVITY_EFFORT_HARD_BOUNDS.bikePowerWatts.max,
    decimals: 0,
    defaultValue: 250,
    defaultDurationSeconds: 1200,
    durationPresets: [5, 60, 300, 1200, 3600],
  },
  {
    id: "bike_heart_rate",
    activityCategory: "bike",
    effortType: "heart_rate",
    label: "Bike heart rate",
    valueLabel: "Heart rate",
    unit: "bpm",
    storageUnit: "bpm",
    inputKind: "integer",
    min: ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm.min,
    max: ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm.max,
    decimals: 0,
    defaultValue: 160,
    defaultDurationSeconds: 1200,
    durationPresets: [60, 300, 600, 1200, 1800, 3600],
  },
  {
    id: "run_speed",
    activityCategory: "run",
    effortType: "speed",
    label: "Run speed",
    valueLabel: "Speed",
    unit: "m/s",
    storageUnit: "meters_per_second",
    inputKind: "decimal",
    min: ACTIVITY_EFFORT_HARD_BOUNDS.runSpeedMetersPerSecond.min,
    max: ACTIVITY_EFFORT_HARD_BOUNDS.runSpeedMetersPerSecond.max,
    decimals: 2,
    defaultValue: 4,
    defaultDurationSeconds: 1200,
    durationPresets: [60, 300, 600, 1200, 3600],
  },
  {
    id: "run_heart_rate",
    activityCategory: "run",
    effortType: "heart_rate",
    label: "Run heart rate",
    valueLabel: "Heart rate",
    unit: "bpm",
    storageUnit: "bpm",
    inputKind: "integer",
    min: ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm.min,
    max: ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm.max,
    decimals: 0,
    defaultValue: 160,
    defaultDurationSeconds: 1200,
    durationPresets: [60, 300, 600, 1200, 1800, 3600],
  },
  {
    id: "swim_speed",
    activityCategory: "swim",
    effortType: "speed",
    label: "Swim speed",
    valueLabel: "Speed",
    unit: "m/s",
    storageUnit: "meters_per_second",
    inputKind: "decimal",
    min: ACTIVITY_EFFORT_HARD_BOUNDS.swimSpeedMetersPerSecond.min,
    max: ACTIVITY_EFFORT_HARD_BOUNDS.swimSpeedMetersPerSecond.max,
    decimals: 2,
    defaultValue: 1.2,
    defaultDurationSeconds: 300,
    durationPresets: [30, 60, 120, 300, 1200, 1800],
  },
  {
    id: "swim_heart_rate",
    activityCategory: "swim",
    effortType: "heart_rate",
    label: "Swim heart rate",
    valueLabel: "Heart rate",
    unit: "bpm",
    storageUnit: "bpm",
    inputKind: "integer",
    min: ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm.min,
    max: ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm.max,
    decimals: 0,
    defaultValue: 150,
    defaultDurationSeconds: 1200,
    durationPresets: [60, 300, 600, 1200, 1800, 3600],
  },
] as const satisfies readonly ActivityEffortDefinition[];

export function getActivityEffortDefinitionsForCategory(
  activityCategory: ActivityEffortCategory,
): ActivityEffortDefinition[] {
  return activityEffortDefinitions.filter(
    (definition) => definition.activityCategory === activityCategory,
  );
}

export function getActivityEffortDefinition(input: {
  activityCategory: ActivityEffortCategory;
  effortType: ActivityEffortType;
}): ActivityEffortDefinition | null {
  return (
    activityEffortDefinitions.find(
      (definition) =>
        definition.activityCategory === input.activityCategory &&
        definition.effortType === input.effortType,
    ) ?? null
  );
}

export function getDefaultActivityEffortDefinition(
  activityCategory: ActivityEffortCategory = "bike",
): ActivityEffortDefinition {
  const categoryDefault = getActivityEffortDefinitionsForCategory(activityCategory)[0];
  if (categoryDefault) return categoryDefault;

  const fallback = activityEffortDefinitions[0];
  if (!fallback) throw new Error("No activity effort definitions are configured");
  return fallback;
}

export function normalizeActivityEffortValue(
  definition: ActivityEffortDefinition,
  value: number,
): number {
  const rounded = Number(value.toFixed(definition.decimals));
  return definition.decimals === 0 ? Math.round(rounded) : rounded;
}

export function getActivityEffortDefinitionId(input: {
  activity_category: ActivityEffortCategory | string;
  effort_type: ActivityEffortType | string;
}): string | null {
  const parsedCategory = canonicalSportSchema.safeParse(input.activity_category);
  const parsedType = activityEffortTypeSchema.safeParse(input.effort_type);
  if (!parsedCategory.success || !parsedType.success) return null;
  return (
    getActivityEffortDefinition({
      activityCategory: parsedCategory.data,
      effortType: parsedType.data,
    })?.id ?? null
  );
}

export function formatEffortDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  return `${remainingSeconds}s`;
}

export function formatActivityEffortValue(input: {
  activity_category: ActivityEffortCategory | string;
  effort_type: ActivityEffortType | string;
  value: number;
  unit?: string | null;
}): string {
  const parsedCategory = canonicalSportSchema.safeParse(input.activity_category);
  const parsedType = activityEffortTypeSchema.safeParse(input.effort_type);
  const definition =
    parsedCategory.success && parsedType.success
      ? getActivityEffortDefinition({
          activityCategory: parsedCategory.data,
          effortType: parsedType.data,
        })
      : null;
  const decimals = definition?.decimals ?? 1;
  const value = Number.isFinite(input.value)
    ? Number(input.value.toFixed(decimals)).toString()
    : "—";
  return `${value} ${definition?.unit ?? input.unit ?? ""}`.trim();
}

const activityEffortWritableFieldsSchema = z
  .object({
    activity_id: z.string().uuid().optional().nullable(),
    segment_id: z.string().uuid().optional().nullable(),
    activity_category: canonicalSportSchema,
    duration_seconds: z
      .number()
      .int()
      .min(ACTIVITY_EFFORT_HARD_BOUNDS.durationSeconds.min)
      .max(ACTIVITY_EFFORT_HARD_BOUNDS.durationSeconds.max),
    distance_meters: z.number().int().positive().max(1_000_000).optional().nullable(),
    effort_type: activityEffortTypeSchema,
    value: z
      .number()
      .finite()
      .min(ACTIVITY_EFFORT_HARD_BOUNDS.swimSpeedMetersPerSecond.min)
      .max(ACTIVITY_EFFORT_HARD_BOUNDS.bikePowerWatts.max),
    start_offset: z.number().int().nonnegative().optional().nullable(),
    recorded_at: z.string().datetime(),
  })
  .strict();

export const createActivityEffortInputSchema = activityEffortWritableFieldsSchema
  .superRefine((data, ctx) => {
    if ((data.activity_id == null) !== (data.segment_id == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Activity-backed efforts require both activity_id and segment_id",
        path: [data.activity_id == null ? "activity_id" : "segment_id"],
      });
    }
    if (data.activity_id != null && data.start_offset == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Activity-backed efforts require a parent-relative start_offset",
        path: ["start_offset"],
      });
    }
    const definition = getActivityEffortDefinition({
      activityCategory: data.activity_category,
      effortType: data.effort_type,
    });

    if (!definition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This effort type is not supported for the selected activity category",
        path: ["effort_type"],
      });
      return;
    }

    if (data.value < definition.min || data.value > definition.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.valueLabel} must be between ${definition.min} and ${definition.max} ${definition.unit}`,
        path: ["value"],
      });
    }
  })
  .transform((data) => {
    const definition = getActivityEffortDefinition({
      activityCategory: data.activity_category,
      effortType: data.effort_type,
    });
    return {
      ...data,
      unit: definition?.storageUnit ?? "",
      value: definition ? normalizeActivityEffortValue(definition, data.value) : data.value,
    };
  });

export const updateActivityEffortInputSchema = activityEffortWritableFieldsSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .strict()
  .superRefine((data, ctx) => {
    if (data.activity_category === undefined || data.effort_type === undefined) return;
    const definition = getActivityEffortDefinition({
      activityCategory: data.activity_category,
      effortType: data.effort_type,
    });
    if (!definition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This effort type is not supported for the selected activity category",
        path: ["effort_type"],
      });
      return;
    }
    if (data.value !== undefined && (data.value < definition.min || data.value > definition.max)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.valueLabel} must be between ${definition.min} and ${definition.max} ${definition.unit}`,
        path: ["value"],
      });
    }
  });

export interface ActivityEffortUpdateExisting {
  activity_category: ActivityEffortCategory;
  effort_type: ActivityEffortType;
  duration_seconds: number;
  distance_meters?: number | null;
  value: number;
  recorded_at: Date | string;
  activity_id?: string | null;
  segment_id?: string | null;
  start_offset?: number | null;
}

export function normalizeActivityEffortUpdate(
  existing: ActivityEffortUpdateExisting,
  patch: z.output<typeof updateActivityEffortInputSchema>,
) {
  const effective = {
    activity_id:
      patch.activity_id === undefined ? (existing.activity_id ?? null) : patch.activity_id,
    segment_id: patch.segment_id === undefined ? (existing.segment_id ?? null) : patch.segment_id,
    activity_category: patch.activity_category ?? existing.activity_category,
    duration_seconds: patch.duration_seconds ?? existing.duration_seconds,
    distance_meters:
      patch.distance_meters === undefined
        ? (existing.distance_meters ?? null)
        : patch.distance_meters,
    effort_type: patch.effort_type ?? existing.effort_type,
    value: patch.value ?? existing.value,
    start_offset:
      patch.start_offset === undefined ? (existing.start_offset ?? null) : patch.start_offset,
    recorded_at:
      patch.recorded_at ??
      (existing.recorded_at instanceof Date
        ? existing.recorded_at.toISOString()
        : new Date(existing.recorded_at).toISOString()),
  };
  const normalized = createActivityEffortInputSchema.parse(effective);
  return {
    activity_id: patch.activity_id === undefined ? undefined : normalized.activity_id,
    segment_id: patch.segment_id === undefined ? undefined : normalized.segment_id,
    activity_category:
      patch.activity_category === undefined ? undefined : normalized.activity_category,
    duration_seconds:
      patch.duration_seconds === undefined ? undefined : normalized.duration_seconds,
    distance_meters: patch.distance_meters === undefined ? undefined : normalized.distance_meters,
    effort_type: patch.effort_type === undefined ? undefined : normalized.effort_type,
    value: patch.value === undefined ? undefined : normalized.value,
    unit: normalized.unit,
    start_offset: patch.start_offset === undefined ? undefined : normalized.start_offset,
    recorded_at: patch.recorded_at === undefined ? undefined : normalized.recorded_at,
  };
}

export type ActivityEffortCreateInput = z.infer<typeof createActivityEffortInputSchema>;
export type ActivityEffortUpdateInput = z.infer<typeof updateActivityEffortInputSchema>;
