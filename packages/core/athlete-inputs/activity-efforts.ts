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
    unit: z.string().min(1).optional(),
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
      unit: definition?.unit ?? data.unit ?? "",
      value: definition ? normalizeActivityEffortValue(definition, data.value) : data.value,
    };
  });

export const updateActivityEffortInputSchema = activityEffortWritableFieldsSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .strict();

export type ActivityEffortCreateInput = z.infer<typeof createActivityEffortInputSchema>;
export type ActivityEffortUpdateInput = z.infer<typeof updateActivityEffortInputSchema>;
