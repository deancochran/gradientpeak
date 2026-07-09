import { z } from "zod";

export const profileMetricTypeSchema = z.enum([
  "weight_kg",
  "ftp",
  "resting_hr",
  "sleep_hours",
  "hrv_rmssd",
  "vo2_max",
  "body_fat_percentage",
  "hydration_level",
  "stress_score",
  "soreness_level",
  "wellness_score",
  "max_hr",
  "lthr",
]);

export type ProfileMetricType = z.infer<typeof profileMetricTypeSchema>;

export type ProfileMetricInputKind = "weight" | "integer" | "decimal" | "percent" | "scale";

export interface ProfileMetricDefinition {
  type: ProfileMetricType;
  label: string;
  unit: string;
  inputKind: ProfileMetricInputKind;
  min: number;
  max: number;
  decimals: number;
  description?: string;
}

export const profileMetricDefinitions = {
  weight_kg: {
    type: "weight_kg",
    label: "Weight",
    unit: "kg",
    inputKind: "weight",
    min: 30,
    max: 300,
    decimals: 1,
  },
  ftp: {
    type: "ftp",
    label: "Bike FTP",
    unit: "W",
    inputKind: "integer",
    min: 50,
    max: 1000,
    decimals: 0,
  },
  resting_hr: {
    type: "resting_hr",
    label: "Resting heart rate",
    unit: "bpm",
    inputKind: "integer",
    min: 30,
    max: 120,
    decimals: 0,
  },
  sleep_hours: {
    type: "sleep_hours",
    label: "Sleep",
    unit: "hours",
    inputKind: "decimal",
    min: 0,
    max: 24,
    decimals: 1,
  },
  hrv_rmssd: {
    type: "hrv_rmssd",
    label: "HRV RMSSD",
    unit: "ms",
    inputKind: "integer",
    min: 0,
    max: 300,
    decimals: 0,
  },
  vo2_max: {
    type: "vo2_max",
    label: "VO2 max",
    unit: "ml/kg/min",
    inputKind: "decimal",
    min: 10,
    max: 100,
    decimals: 1,
  },
  body_fat_percentage: {
    type: "body_fat_percentage",
    label: "Body fat",
    unit: "%",
    inputKind: "percent",
    min: 0,
    max: 100,
    decimals: 1,
  },
  hydration_level: {
    type: "hydration_level",
    label: "Hydration",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
  },
  stress_score: {
    type: "stress_score",
    label: "Stress",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
  },
  soreness_level: {
    type: "soreness_level",
    label: "Soreness",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
  },
  wellness_score: {
    type: "wellness_score",
    label: "Wellness",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
  },
  max_hr: {
    type: "max_hr",
    label: "Max heart rate",
    unit: "bpm",
    inputKind: "integer",
    min: 100,
    max: 250,
    decimals: 0,
  },
  lthr: {
    type: "lthr",
    label: "Threshold heart rate",
    unit: "bpm",
    inputKind: "integer",
    min: 80,
    max: 220,
    decimals: 0,
  },
} as const satisfies Record<ProfileMetricType, ProfileMetricDefinition>;

export const profileMetricTypes = Object.keys(profileMetricDefinitions) as ProfileMetricType[];

export function getProfileMetricDefinition(metricType: ProfileMetricType): ProfileMetricDefinition {
  return profileMetricDefinitions[metricType];
}

export function isProfileMetricType(value: string): value is ProfileMetricType {
  return profileMetricTypeSchema.safeParse(value).success;
}

export function isProfileMetricValueWithinRange(metricType: string, value: number): boolean {
  if (!Number.isFinite(value) || !isProfileMetricType(metricType)) return false;
  const definition = getProfileMetricDefinition(metricType);
  return value >= definition.min && value <= definition.max;
}

export function normalizeProfileMetricValue(metricType: ProfileMetricType, value: number): number {
  const definition = getProfileMetricDefinition(metricType);
  const rounded = Number(value.toFixed(definition.decimals));
  return definition.decimals === 0 ? Math.round(rounded) : rounded;
}

export function formatProfileMetricValue(input: {
  metric_type: string;
  value: number;
  unit?: string | null;
}): string {
  const unit = isProfileMetricType(input.metric_type)
    ? getProfileMetricDefinition(input.metric_type).unit
    : input.unit;
  const decimals = isProfileMetricType(input.metric_type)
    ? getProfileMetricDefinition(input.metric_type).decimals
    : 1;
  const value = Number.isFinite(input.value)
    ? Number(input.value.toFixed(decimals)).toString()
    : "—";
  return unit && unit !== "scale" ? `${value} ${unit}` : value;
}

export const profileMetricNotesSchema = z
  .string()
  .max(1000, "Notes must be less than 1000 characters")
  .nullable()
  .optional();

export const profileMetricRecordedAtSchema = z.string().datetime("Invalid datetime").optional();

export const createProfileMetricInputSchema = z
  .object({
    metric_type: profileMetricTypeSchema,
    notes: profileMetricNotesSchema,
    recorded_at: profileMetricRecordedAtSchema,
    reference_activity_id: z.string().uuid("Invalid activity ID").nullable().optional(),
    unit: z.string().min(1, "Unit is required").optional(),
    value: z.number().finite(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (isProfileMetricValueWithinRange(data.metric_type, data.value)) return;
    const definition = getProfileMetricDefinition(data.metric_type);
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${definition.label} must be between ${definition.min} and ${definition.max} ${definition.unit}`,
      path: ["value"],
    });
  })
  .transform((data) => ({
    ...data,
    unit: data.unit ?? getProfileMetricDefinition(data.metric_type).unit,
    value: normalizeProfileMetricValue(data.metric_type, data.value),
  }));

export const updateProfileMetricInputSchema = z
  .object({
    id: z.string().uuid("Invalid metric ID"),
    value: z.number().finite().optional(),
    unit: z.string().min(1, "Unit is required").optional(),
    notes: profileMetricNotesSchema,
    recorded_at: profileMetricRecordedAtSchema,
  })
  .strict();

export type CreateProfileMetricInput = z.infer<typeof createProfileMetricInputSchema>;
export type UpdateProfileMetricInput = z.infer<typeof updateProfileMetricInputSchema>;
