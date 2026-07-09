import { z } from "zod";
import { canonicalSportSchema } from "../schemas/sport";

export const activityEffortTypeSchema = z.enum(["power", "speed"]);

export type ActivityEffortType = z.infer<typeof activityEffortTypeSchema>;
export type ActivityEffortCategory = z.infer<typeof canonicalSportSchema>;
export type ActivityEffortInputKind = "integer" | "decimal";

export interface ActivityEffortDefinition {
  id: string;
  activityCategory: ActivityEffortCategory;
  effortType: ActivityEffortType;
  label: string;
  valueLabel: string;
  unit: string;
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
    inputKind: "integer",
    min: 1,
    max: 2500,
    decimals: 0,
    defaultValue: 250,
    defaultDurationSeconds: 1200,
    durationPresets: [5, 60, 300, 1200, 3600],
  },
  {
    id: "run_speed",
    activityCategory: "run",
    effortType: "speed",
    label: "Run speed",
    valueLabel: "Speed",
    unit: "m/s",
    inputKind: "decimal",
    min: 0.5,
    max: 12,
    decimals: 2,
    defaultValue: 4,
    defaultDurationSeconds: 1200,
    durationPresets: [60, 300, 600, 1200, 3600],
  },
  {
    id: "swim_speed",
    activityCategory: "swim",
    effortType: "speed",
    label: "Swim speed",
    valueLabel: "Speed",
    unit: "m/s",
    inputKind: "decimal",
    min: 0.2,
    max: 3,
    decimals: 2,
    defaultValue: 1.2,
    defaultDurationSeconds: 400,
    durationPresets: [50, 100, 200, 400, 1500],
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
    activity_category: canonicalSportSchema,
    duration_seconds: z.number().int().positive(),
    effort_type: activityEffortTypeSchema,
    value: z.number().finite(),
    start_offset: z.number().int().nonnegative().optional().nullable(),
    recorded_at: z.string().datetime(),
  })
  .strict();

export const createActivityEffortInputSchema = activityEffortWritableFieldsSchema
  .superRefine((data, ctx) => {
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
      unit: definition?.unit ?? "",
      value: definition ? normalizeActivityEffortValue(definition, data.value) : data.value,
    };
  });

export const updateActivityEffortInputSchema = activityEffortWritableFieldsSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .strict();

export interface ActivityEffortUpdateExisting {
  activity_category: ActivityEffortCategory;
  effort_type: ActivityEffortType;
  duration_seconds: number;
  value: number;
  recorded_at: Date | string;
  activity_id?: string | null;
  start_offset?: number | null;
}

export function normalizeActivityEffortUpdate(
  existing: ActivityEffortUpdateExisting,
  patch: z.output<typeof updateActivityEffortInputSchema>,
) {
  const effective = {
    activity_id: patch.activity_id ?? existing.activity_id ?? null,
    activity_category: patch.activity_category ?? existing.activity_category,
    duration_seconds: patch.duration_seconds ?? existing.duration_seconds,
    effort_type: patch.effort_type ?? existing.effort_type,
    value: patch.value ?? existing.value,
    start_offset: patch.start_offset ?? existing.start_offset ?? null,
    recorded_at:
      patch.recorded_at ??
      (existing.recorded_at instanceof Date
        ? existing.recorded_at.toISOString()
        : new Date(existing.recorded_at).toISOString()),
  };
  const normalized = createActivityEffortInputSchema.parse(effective);
  return {
    activity_id: patch.activity_id === undefined ? undefined : normalized.activity_id,
    activity_category:
      patch.activity_category === undefined ? undefined : normalized.activity_category,
    duration_seconds:
      patch.duration_seconds === undefined ? undefined : normalized.duration_seconds,
    effort_type: patch.effort_type === undefined ? undefined : normalized.effort_type,
    value: patch.value === undefined ? undefined : normalized.value,
    unit: normalized.unit,
    start_offset: patch.start_offset === undefined ? undefined : normalized.start_offset,
    recorded_at: patch.recorded_at === undefined ? undefined : normalized.recorded_at,
  };
}

export type ActivityEffortCreateInput = z.infer<typeof createActivityEffortInputSchema>;
export type ActivityEffortUpdateInput = z.infer<typeof updateActivityEffortInputSchema>;
