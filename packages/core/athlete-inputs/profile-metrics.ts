import { z } from "zod";
import {
  type CanonicalUnitValue,
  displayUnitLabel,
  type PreferredUnitSystem,
  toCanonicalUnitValue,
  toDisplayUnitValue,
} from "../units";

export const profileMetricTypeSchema = z.enum([
  "weight_kg",
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
  defaultValue: number;
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
    defaultValue: 70,
  },
  resting_hr: {
    type: "resting_hr",
    label: "Resting heart rate",
    unit: "bpm",
    inputKind: "integer",
    min: 30,
    max: 120,
    decimals: 0,
    defaultValue: 60,
  },
  sleep_hours: {
    type: "sleep_hours",
    label: "Sleep",
    unit: "hours",
    inputKind: "decimal",
    min: 0,
    max: 24,
    decimals: 1,
    defaultValue: 7,
  },
  hrv_rmssd: {
    type: "hrv_rmssd",
    label: "HRV RMSSD",
    unit: "ms",
    inputKind: "integer",
    min: 0,
    max: 300,
    decimals: 0,
    defaultValue: 40,
  },
  vo2_max: {
    type: "vo2_max",
    label: "VO2 max",
    unit: "ml/kg/min",
    inputKind: "decimal",
    min: 10,
    max: 100,
    decimals: 1,
    defaultValue: 45,
  },
  body_fat_percentage: {
    type: "body_fat_percentage",
    label: "Body fat",
    unit: "%",
    inputKind: "percent",
    min: 0,
    max: 100,
    decimals: 1,
    defaultValue: 18,
  },
  hydration_level: {
    type: "hydration_level",
    label: "Hydration",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
    defaultValue: 5,
  },
  stress_score: {
    type: "stress_score",
    label: "Stress",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
    defaultValue: 5,
  },
  soreness_level: {
    type: "soreness_level",
    label: "Soreness",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
    defaultValue: 3,
  },
  wellness_score: {
    type: "wellness_score",
    label: "Wellness",
    unit: "scale",
    inputKind: "scale",
    min: 0,
    max: 10,
    decimals: 0,
    defaultValue: 5,
  },
  max_hr: {
    type: "max_hr",
    label: "Max heart rate",
    unit: "bpm",
    inputKind: "integer",
    min: 100,
    max: 250,
    decimals: 0,
    defaultValue: 185,
  },
} as const satisfies Record<ProfileMetricType, ProfileMetricDefinition>;

export const profileMetricTypes = profileMetricTypeSchema.options;

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

function getConvertibleProfileMetricCanonicalValue(
  metricType: ProfileMetricType,
  value: number,
): CanonicalUnitValue | null {
  if (metricType === "weight_kg") {
    return { dimension: "mass", value, unit: "kilograms" };
  }
  return null;
}

/** Converts canonical profile-metric values for viewer-controlled presentation. */
export function getProfileMetricDisplayValue(
  metricType: ProfileMetricType,
  value: number,
  preferredUnitSystem: PreferredUnitSystem = "metric",
): number {
  const canonical = getConvertibleProfileMetricCanonicalValue(metricType, value);
  return canonical ? toDisplayUnitValue(canonical, preferredUnitSystem).value : value;
}

/** Returns the viewer-facing unit without changing the canonical metric contract. */
export function getProfileMetricDisplayUnit(
  metricType: ProfileMetricType,
  preferredUnitSystem: PreferredUnitSystem = "metric",
): string {
  const canonical = getConvertibleProfileMetricCanonicalValue(metricType, 0);
  return canonical
    ? displayUnitLabel(toDisplayUnitValue(canonical, preferredUnitSystem).unit)
    : getProfileMetricDefinition(metricType).unit;
}

/** Converts a displayed profile-metric input back to its canonical persisted value. */
export function getCanonicalProfileMetricValueFromDisplay(
  metricType: ProfileMetricType,
  value: number,
  preferredUnitSystem: PreferredUnitSystem = "metric",
): number | null {
  if (!Number.isFinite(value)) return null;
  const canonical = getConvertibleProfileMetricCanonicalValue(metricType, 0);
  if (!canonical) return value;
  const displayTemplate = toDisplayUnitValue(canonical, preferredUnitSystem);
  return toCanonicalUnitValue({ ...displayTemplate, value })?.value ?? null;
}

export function formatProfileMetricValue(input: {
  metric_type: string;
  preferredUnitSystem?: PreferredUnitSystem;
  value: number;
  unit?: string | null;
}): string {
  if (Number.isFinite(input.value) && isProfileMetricType(input.metric_type)) {
    const canonical = getConvertibleProfileMetricCanonicalValue(input.metric_type, input.value);
    if (canonical) {
      const display = toDisplayUnitValue(canonical, input.preferredUnitSystem ?? "metric");
      const label = displayUnitLabel(display.unit);
      const decimals = getProfileMetricDefinition(input.metric_type).decimals;
      return `${Number(display.value.toFixed(decimals))} ${label}`;
    }
  }

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

/**
 * A durable manual override is stored in a metric row with `source: "manual"`
 * and this value under `provenance.manual_override`.
 */
export const profileMetricManualOverrideSchema = z
  .object({
    locked: z.literal(true),
  })
  .strict();

export type ProfileMetricManualOverride = z.infer<typeof profileMetricManualOverrideSchema>;

/**
 * Keeps metric-specific provenance extensible while reserving an explicit
 * manual override representation for profile-observation provenance.
 */
export const profileMetricProvenanceSchema = z
  .object({
    manual_override: profileMetricManualOverrideSchema.optional(),
  })
  .passthrough();

export type ProfileMetricProvenance = z.infer<typeof profileMetricProvenanceSchema>;

export const profileMetricObservationSourceSchema = z.enum([
  "manual",
  "test",
  "imported",
  "provider",
  "estimated",
  "derived",
]);

export const profileMetricObservationSchema = z
  .object({
    metric_type: profileMetricTypeSchema,
    provenance: profileMetricProvenanceSchema.nullable().optional(),
    source: profileMetricObservationSourceSchema.nullable().optional(),
  })
  .strict()
  .superRefine((metric, ctx) => {
    if (metric.provenance?.manual_override && metric.source !== "manual") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A locked manual override must have source manual",
        path: ["source"],
      });
    }
  });

export type ProfileMetricObservation = z.infer<typeof profileMetricObservationSchema>;

export const profileMetricCreatePayloadSchema = z
  .object({
    metric_type: profileMetricTypeSchema,
    notes: profileMetricNotesSchema,
    recorded_at: profileMetricRecordedAtSchema,
    reference_activity_id: z.string().uuid("Invalid activity ID").nullable().optional(),
    value: z.number().finite(),
  })
  .strict();

export function addProfileMetricValueRangeIssue(
  data: { metric_type: ProfileMetricType; value: number },
  ctx: z.RefinementCtx,
) {
  if (isProfileMetricValueWithinRange(data.metric_type, data.value)) return;
  const definition = getProfileMetricDefinition(data.metric_type);
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${definition.label} must be between ${definition.min} and ${definition.max} ${definition.unit}`,
    path: ["value"],
  });
}

export const createProfileMetricInputSchema = profileMetricCreatePayloadSchema
  .superRefine((data, ctx) => {
    addProfileMetricValueRangeIssue(data, ctx);
  })
  .transform((data) => ({
    ...data,
    unit: getProfileMetricDefinition(data.metric_type).unit,
    value: normalizeProfileMetricValue(data.metric_type, data.value),
  }));

export function normalizeProfileMetricCreate(
  input: z.output<typeof profileMetricCreatePayloadSchema>,
): z.output<typeof createProfileMetricInputSchema> {
  return createProfileMetricInputSchema.parse(input);
}

export const updateProfileMetricInputSchema = z
  .object({
    id: z.string().uuid("Invalid metric ID"),
    value: z.number().finite().optional(),
    notes: profileMetricNotesSchema,
    recorded_at: profileMetricRecordedAtSchema,
  })
  .strict();

export interface ProfileMetricUpdateExisting {
  metric_type: ProfileMetricType;
}

export function normalizeProfileMetricUpdate(
  existing: ProfileMetricUpdateExisting,
  patch: z.output<typeof updateProfileMetricInputSchema>,
) {
  const definition = getProfileMetricDefinition(existing.metric_type);
  const normalizedValue =
    patch.value === undefined
      ? undefined
      : normalizeProfileMetricValue(existing.metric_type, patch.value);

  if (
    normalizedValue !== undefined &&
    !isProfileMetricValueWithinRange(existing.metric_type, normalizedValue)
  ) {
    throw new Error(
      `${definition.label} must be between ${definition.min} and ${definition.max} ${definition.unit}`,
    );
  }

  return {
    value: normalizedValue,
    unit: definition.unit,
    notes: patch.notes,
    recorded_at: patch.recorded_at,
  };
}

export type CreateProfileMetricInput = z.infer<typeof createProfileMetricInputSchema>;
export type UpdateProfileMetricInput = z.infer<typeof updateProfileMetricInputSchema>;
