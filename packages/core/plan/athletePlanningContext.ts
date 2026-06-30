import { z } from "zod";

const dateLikeSchema = z.union([z.string(), z.date()]).nullable().optional();

const activityCategorySchema = z.enum(["run", "bike", "swim", "strength", "other"]);
const effortTypeSchema = z.enum(["power", "speed"]);
const genderSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);
const preferredUnitsSchema = z.enum(["metric", "imperial"]);

export const athleteContextMetricTypeSchema = z.enum([
  "weight_kg",
  "height_cm",
  "ftp",
  "resting_hr",
  "max_hr",
  "lthr",
  "hrv_rmssd",
  "vo2_max",
  "body_fat_percentage",
  "sleep_hours",
  "hydration_level",
  "stress_score",
  "soreness_level",
  "wellness_score",
]);

export const athleteContextValueSourceSchema = z.enum([
  "profile",
  "profile_metric",
  "training_status",
  "activity_effort",
  "manual_override",
  "default",
  "unknown",
]);

export const athleteContextEvidenceValueSchema = z
  .object({
    value: z.number().finite().nullable(),
    source: athleteContextValueSourceSchema,
    recordedAt: z.string().nullable(),
    unit: z.string().nullable(),
    overridden: z.boolean().default(false),
  })
  .strict();

export const athleteContextProfileSourceSchema = z
  .object({
    dob: dateLikeSchema,
    gender: z.enum(["male", "female", "other"]).nullable().optional(),
    preferred_units: preferredUnitsSchema.nullable().optional(),
  })
  .strict();

export const athleteContextProfileMetricSourceSchema = z
  .object({
    metric_type: athleteContextMetricTypeSchema.exclude(["height_cm"]),
    value: z.number().finite(),
    unit: z.string().min(1),
    recorded_at: z.union([z.string(), z.date()]),
    notes: z.string().nullable().optional(),
    reference_activity_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const athleteContextActivityEffortSourceSchema = z
  .object({
    activity_category: activityCategorySchema,
    effort_type: effortTypeSchema,
    duration_seconds: z.number().int().positive(),
    value: z.number().finite(),
    unit: z.string().min(1),
    recorded_at: z.union([z.string(), z.date()]),
    activity_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const athleteContextSourceSnapshotSchema = z
  .object({
    profile: athleteContextProfileSourceSchema.nullable().optional(),
    profileMetrics: z.array(athleteContextProfileMetricSourceSchema).default([]),
    activityEfforts: z.array(athleteContextActivityEffortSourceSchema).default([]),
    currentFitness: z
      .object({
        ctl: z.number().finite().nullable().optional(),
        atl: z.number().finite().nullable().optional(),
        tsb: z.number().finite().nullable().optional(),
        recorded_at: z.union([z.string(), z.date()]).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    manualHeightCm: z.number().min(0).max(300).nullable().optional(),
    asOf: z.union([z.string(), z.date()]).optional(),
  })
  .strict();

export const athletePlanningContextSchema = z
  .object({
    demographics: z
      .object({
        birthDate: z.string().nullable(),
        ageYears: athleteContextEvidenceValueSchema,
        gender: genderSchema.nullable(),
        preferredUnits: preferredUnitsSchema.nullable(),
      })
      .strict(),
    body: z
      .object({
        heightCm: athleteContextEvidenceValueSchema,
        weightKg: athleteContextEvidenceValueSchema,
        bmi: athleteContextEvidenceValueSchema,
        bodyFatPercentage: athleteContextEvidenceValueSchema,
      })
      .strict(),
    physiology: z
      .object({
        ftpWatts: athleteContextEvidenceValueSchema,
        restingHeartRateBpm: athleteContextEvidenceValueSchema,
        maxHeartRateBpm: athleteContextEvidenceValueSchema,
        thresholdHeartRateBpm: athleteContextEvidenceValueSchema,
        hrvRmssdMs: athleteContextEvidenceValueSchema,
        vo2Max: athleteContextEvidenceValueSchema,
        currentFitnessCtl: athleteContextEvidenceValueSchema,
        currentFatigueAtl: athleteContextEvidenceValueSchema,
        currentFormTsb: athleteContextEvidenceValueSchema,
      })
      .strict(),
    wellness: z
      .object({
        sleepHours: athleteContextEvidenceValueSchema,
        hydrationLevel: athleteContextEvidenceValueSchema,
        stressScore: athleteContextEvidenceValueSchema,
        sorenessLevel: athleteContextEvidenceValueSchema,
        wellnessScore: athleteContextEvidenceValueSchema,
      })
      .strict(),
    efforts: z.array(
      z
        .object({
          activityCategory: activityCategorySchema,
          effortType: effortTypeSchema,
          durationSeconds: z.number().int().positive(),
          value: z.number().finite(),
          unit: z.string().min(1),
          recordedAt: z.string(),
          source: z.literal("activity_effort"),
        })
        .strict(),
    ),
    evidence: z
      .object({
        metricCount: z.number().int().min(0),
        effortCount: z.number().int().min(0),
        missingFields: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type AthleteContextMetricType = z.infer<typeof athleteContextMetricTypeSchema>;
export type AthletePlanningContext = z.infer<typeof athletePlanningContextSchema>;
export type AthleteContextSourceSnapshot = z.infer<typeof athleteContextSourceSnapshotSchema>;

export type AthletePlanningContextFieldKey =
  | "ageYears"
  | "heightCm"
  | "weightKg"
  | "bmi"
  | "bodyFatPercentage"
  | "ftpWatts"
  | "restingHeartRateBpm"
  | "maxHeartRateBpm"
  | "thresholdHeartRateBpm"
  | "hrvRmssdMs"
  | "vo2Max"
  | "currentFitnessCtl"
  | "currentFatigueAtl"
  | "currentFormTsb"
  | "sleepHours"
  | "hydrationLevel"
  | "stressScore"
  | "sorenessLevel"
  | "wellnessScore";

export type AthletePlanningContextRequirements = Partial<
  Record<AthletePlanningContextFieldKey, { reason: string }>
>;

export interface AthletePlanningContextFieldDescriptor {
  key: AthletePlanningContextFieldKey;
  label: string;
  category: "demographics" | "body" | "physiology" | "wellness";
  inputKind: "number" | "derived";
  defaultUnit: string | null;
  value: z.infer<typeof athleteContextEvidenceValueSchema>;
  visible: boolean;
  required: boolean;
  reason: string | null;
  canOverride: boolean;
  canRemove: boolean;
}

export interface AthletePlanningContextFieldOverride {
  key: AthletePlanningContextFieldKey;
  value: number | null;
  unit?: string | null;
}

export interface AthletePlanningContextEffortInput {
  activityCategory: z.infer<typeof activityCategorySchema>;
  effortType: z.infer<typeof effortTypeSchema>;
  durationSeconds: number;
  value: number;
  unit: string;
  recordedAt: string | Date;
}

export const ATHLETE_CONTEXT_FIELD_REGISTRY: Record<
  AthletePlanningContextFieldKey,
  {
    label: string;
    category: AthletePlanningContextFieldDescriptor["category"];
    inputKind: AthletePlanningContextFieldDescriptor["inputKind"];
    defaultUnit: string | null;
    requiredDefault?: number;
  }
> = {
  ageYears: {
    label: "Age",
    category: "demographics",
    inputKind: "number",
    defaultUnit: "years",
    requiredDefault: 35,
  },
  heightCm: {
    label: "Height",
    category: "body",
    inputKind: "number",
    defaultUnit: "cm",
    requiredDefault: 175,
  },
  weightKg: {
    label: "Weight",
    category: "body",
    inputKind: "number",
    defaultUnit: "kg",
    requiredDefault: 75,
  },
  bmi: {
    label: "BMI",
    category: "body",
    inputKind: "derived",
    defaultUnit: "kg/m2",
    requiredDefault: 24.5,
  },
  bodyFatPercentage: {
    label: "Body fat",
    category: "body",
    inputKind: "number",
    defaultUnit: "%",
  },
  ftpWatts: {
    label: "Bike FTP",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "W",
    requiredDefault: 200,
  },
  restingHeartRateBpm: {
    label: "Resting heart rate",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "bpm",
    requiredDefault: 60,
  },
  maxHeartRateBpm: {
    label: "Max heart rate",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "bpm",
    requiredDefault: 185,
  },
  thresholdHeartRateBpm: {
    label: "Threshold heart rate",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "bpm",
    requiredDefault: 165,
  },
  hrvRmssdMs: {
    label: "HRV RMSSD",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "ms",
    requiredDefault: 40,
  },
  vo2Max: {
    label: "VO2 max",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "ml/kg/min",
    requiredDefault: 42,
  },
  currentFitnessCtl: {
    label: "Fitness",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "CTL",
  },
  currentFatigueAtl: {
    label: "Fatigue",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "ATL",
  },
  currentFormTsb: {
    label: "Form",
    category: "physiology",
    inputKind: "number",
    defaultUnit: "TSB",
  },
  sleepHours: {
    label: "Sleep",
    category: "wellness",
    inputKind: "number",
    defaultUnit: "hours",
    requiredDefault: 7,
  },
  hydrationLevel: {
    label: "Hydration",
    category: "wellness",
    inputKind: "number",
    defaultUnit: "scale",
    requiredDefault: 5,
  },
  stressScore: {
    label: "Stress",
    category: "wellness",
    inputKind: "number",
    defaultUnit: "scale",
    requiredDefault: 5,
  },
  sorenessLevel: {
    label: "Soreness",
    category: "wellness",
    inputKind: "number",
    defaultUnit: "scale",
    requiredDefault: 3,
  },
  wellnessScore: {
    label: "Wellness",
    category: "wellness",
    inputKind: "number",
    defaultUnit: "scale",
    requiredDefault: 5,
  },
};

function toIsoDate(value: z.infer<typeof dateLikeSchema>): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function calculateAgeYears(birthDate: string | null, asOf: string | Date | undefined) {
  if (!birthDate) {
    return null;
  }

  const birth = new Date(birthDate);
  const reference = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function emptyEvidenceValue(
  unit: string | null = null,
): z.infer<typeof athleteContextEvidenceValueSchema> {
  return {
    value: null,
    source: "unknown",
    recordedAt: null,
    unit,
    overridden: false,
  };
}

function defaultEvidenceValue(
  key: AthletePlanningContextFieldKey,
): z.infer<typeof athleteContextEvidenceValueSchema> | null {
  const definition = ATHLETE_CONTEXT_FIELD_REGISTRY[key];
  if (definition.requiredDefault === undefined) {
    return null;
  }

  return {
    value: definition.requiredDefault,
    source: "default",
    recordedAt: null,
    unit: definition.defaultUnit,
    overridden: false,
  };
}

function profileEvidenceValue(
  value: number | null,
  unit: string | null,
): z.infer<typeof athleteContextEvidenceValueSchema> {
  return {
    value,
    source: value === null ? "unknown" : "profile",
    recordedAt: null,
    unit,
    overridden: false,
  };
}

function manualEvidenceValue(
  value: number | null,
  unit: string | null,
): z.infer<typeof athleteContextEvidenceValueSchema> {
  return {
    value,
    source: value === null ? "unknown" : "manual_override",
    recordedAt: null,
    unit,
    overridden: value !== null,
  };
}

function manualEvidenceValueForField({
  key,
  value,
  unit,
}: AthletePlanningContextFieldOverride): z.infer<typeof athleteContextEvidenceValueSchema> {
  return {
    value,
    source: value === null ? "unknown" : "manual_override",
    recordedAt: null,
    unit: unit ?? ATHLETE_CONTEXT_FIELD_REGISTRY[key].defaultUnit,
    overridden: value !== null,
  };
}

function latestMetric(
  metrics: AthleteContextSourceSnapshot["profileMetrics"],
  metricType: Exclude<AthleteContextMetricType, "height_cm">,
) {
  return metrics
    .filter((metric) => metric.metric_type === metricType)
    .sort(
      (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
    )[0];
}

function metricEvidenceValue(
  metrics: AthleteContextSourceSnapshot["profileMetrics"],
  metricType: Exclude<AthleteContextMetricType, "height_cm">,
  fallbackUnit: string,
): z.infer<typeof athleteContextEvidenceValueSchema> {
  const metric = latestMetric(metrics, metricType);
  if (!metric) {
    return emptyEvidenceValue(fallbackUnit);
  }

  return {
    value: metric.value,
    source: "profile_metric",
    recordedAt: toIsoDateTime(metric.recorded_at),
    unit: metric.unit,
    overridden: false,
  };
}

function trainingStatusEvidenceValue(
  value: number | null | undefined,
  unit: string,
  recordedAt: string | Date | null | undefined,
): z.infer<typeof athleteContextEvidenceValueSchema> {
  return {
    value: value ?? null,
    source: value == null ? "unknown" : "training_status",
    recordedAt: recordedAt ? toIsoDateTime(recordedAt) : null,
    unit,
    overridden: false,
  };
}

function calculateBmi(heightCm: number | null, weightKg: number | null) {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return null;
  }
  const heightMeters = heightCm / 100;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
}

export function createAthletePlanningContextFromSnapshot(
  input: z.input<typeof athleteContextSourceSnapshotSchema>,
): AthletePlanningContext {
  const snapshot = athleteContextSourceSnapshotSchema.parse(input);
  const birthDate = toIsoDate(snapshot.profile?.dob);
  const ageYears = calculateAgeYears(birthDate, snapshot.asOf);
  const heightCm = manualEvidenceValue(snapshot.manualHeightCm ?? null, "cm");
  const weightKg = metricEvidenceValue(snapshot.profileMetrics, "weight_kg", "kg");
  const bmi = profileEvidenceValue(calculateBmi(heightCm.value, weightKg.value), "kg/m2");
  const metricTypes = new Set(snapshot.profileMetrics.map((metric) => metric.metric_type));
  const missingFields = [
    birthDate === null ? "dob" : null,
    heightCm.value === null ? "height_cm" : null,
    weightKg.value === null ? "weight_kg" : null,
    !metricTypes.has("ftp") ? "ftp" : null,
    !metricTypes.has("lthr") ? "lthr" : null,
  ].filter((field): field is string => field !== null);

  return athletePlanningContextSchema.parse({
    demographics: {
      birthDate,
      ageYears: profileEvidenceValue(ageYears, "years"),
      gender:
        snapshot.profile?.gender === "male" ||
        snapshot.profile?.gender === "female" ||
        snapshot.profile?.gender === "other"
          ? snapshot.profile.gender
          : null,
      preferredUnits: snapshot.profile?.preferred_units ?? null,
    },
    body: {
      heightCm,
      weightKg,
      bmi,
      bodyFatPercentage: metricEvidenceValue(snapshot.profileMetrics, "body_fat_percentage", "%"),
    },
    physiology: {
      ftpWatts: metricEvidenceValue(snapshot.profileMetrics, "ftp", "W"),
      restingHeartRateBpm: metricEvidenceValue(snapshot.profileMetrics, "resting_hr", "bpm"),
      maxHeartRateBpm: metricEvidenceValue(snapshot.profileMetrics, "max_hr", "bpm"),
      thresholdHeartRateBpm: metricEvidenceValue(snapshot.profileMetrics, "lthr", "bpm"),
      hrvRmssdMs: metricEvidenceValue(snapshot.profileMetrics, "hrv_rmssd", "ms"),
      vo2Max: metricEvidenceValue(snapshot.profileMetrics, "vo2_max", "ml/kg/min"),
      currentFitnessCtl: trainingStatusEvidenceValue(
        snapshot.currentFitness?.ctl,
        "CTL",
        snapshot.currentFitness?.recorded_at ?? snapshot.asOf,
      ),
      currentFatigueAtl: trainingStatusEvidenceValue(
        snapshot.currentFitness?.atl,
        "ATL",
        snapshot.currentFitness?.recorded_at ?? snapshot.asOf,
      ),
      currentFormTsb: trainingStatusEvidenceValue(
        snapshot.currentFitness?.tsb,
        "TSB",
        snapshot.currentFitness?.recorded_at ?? snapshot.asOf,
      ),
    },
    wellness: {
      sleepHours: metricEvidenceValue(snapshot.profileMetrics, "sleep_hours", "hours"),
      hydrationLevel: metricEvidenceValue(snapshot.profileMetrics, "hydration_level", "scale"),
      stressScore: metricEvidenceValue(snapshot.profileMetrics, "stress_score", "scale"),
      sorenessLevel: metricEvidenceValue(snapshot.profileMetrics, "soreness_level", "scale"),
      wellnessScore: metricEvidenceValue(snapshot.profileMetrics, "wellness_score", "scale"),
    },
    efforts: snapshot.activityEfforts.map((effort) => ({
      activityCategory: effort.activity_category,
      effortType: effort.effort_type,
      durationSeconds: effort.duration_seconds,
      value: effort.value,
      unit: effort.unit,
      recordedAt: toIsoDateTime(effort.recorded_at),
      source: "activity_effort",
    })),
    evidence: {
      metricCount: snapshot.profileMetrics.length,
      effortCount: snapshot.activityEfforts.length,
      missingFields,
    },
  });
}

function withRecalculatedDerivedBodyValues(
  context: AthletePlanningContext,
): AthletePlanningContext {
  return athletePlanningContextSchema.parse({
    ...context,
    body: {
      ...context.body,
      bmi: profileEvidenceValue(
        calculateBmi(context.body.heightCm.value, context.body.weightKg.value),
        "kg/m2",
      ),
    },
    evidence: {
      ...context.evidence,
      missingFields: [
        context.demographics.birthDate === null ? "dob" : null,
        context.body.heightCm.value === null ? "height_cm" : null,
        context.body.weightKg.value === null ? "weight_kg" : null,
        context.physiology.ftpWatts.value === null ? "ftp" : null,
        context.physiology.thresholdHeartRateBpm.value === null ? "lthr" : null,
      ].filter((field): field is string => field !== null),
    },
  });
}

export function overrideAthletePlanningContextField(
  context: AthletePlanningContext,
  override: AthletePlanningContextFieldOverride,
): AthletePlanningContext {
  const value = manualEvidenceValueForField(override);

  const next = (() => {
    switch (override.key) {
      case "ageYears":
        return { ...context, demographics: { ...context.demographics, ageYears: value } };
      case "heightCm":
        return { ...context, body: { ...context.body, heightCm: value } };
      case "weightKg":
        return { ...context, body: { ...context.body, weightKg: value } };
      case "bmi":
        return { ...context, body: { ...context.body, bmi: value } };
      case "bodyFatPercentage":
        return { ...context, body: { ...context.body, bodyFatPercentage: value } };
      case "ftpWatts":
        return { ...context, physiology: { ...context.physiology, ftpWatts: value } };
      case "restingHeartRateBpm":
        return { ...context, physiology: { ...context.physiology, restingHeartRateBpm: value } };
      case "maxHeartRateBpm":
        return { ...context, physiology: { ...context.physiology, maxHeartRateBpm: value } };
      case "thresholdHeartRateBpm":
        return { ...context, physiology: { ...context.physiology, thresholdHeartRateBpm: value } };
      case "hrvRmssdMs":
        return { ...context, physiology: { ...context.physiology, hrvRmssdMs: value } };
      case "vo2Max":
        return { ...context, physiology: { ...context.physiology, vo2Max: value } };
      case "currentFitnessCtl":
        return { ...context, physiology: { ...context.physiology, currentFitnessCtl: value } };
      case "currentFatigueAtl":
        return { ...context, physiology: { ...context.physiology, currentFatigueAtl: value } };
      case "currentFormTsb":
        return { ...context, physiology: { ...context.physiology, currentFormTsb: value } };
      case "sleepHours":
        return { ...context, wellness: { ...context.wellness, sleepHours: value } };
      case "hydrationLevel":
        return { ...context, wellness: { ...context.wellness, hydrationLevel: value } };
      case "stressScore":
        return { ...context, wellness: { ...context.wellness, stressScore: value } };
      case "sorenessLevel":
        return { ...context, wellness: { ...context.wellness, sorenessLevel: value } };
      case "wellnessScore":
        return { ...context, wellness: { ...context.wellness, wellnessScore: value } };
    }
  })();

  return withRecalculatedDerivedBodyValues(athletePlanningContextSchema.parse(next));
}

export function removeAthletePlanningContextField(
  context: AthletePlanningContext,
  key: AthletePlanningContextFieldKey,
): AthletePlanningContext {
  return overrideAthletePlanningContextField(context, { key, value: null });
}

export function addAthletePlanningContextEffort(
  context: AthletePlanningContext,
  effort: AthletePlanningContextEffortInput,
): AthletePlanningContext {
  return athletePlanningContextSchema.parse({
    ...context,
    efforts: [
      ...context.efforts,
      {
        activityCategory: effort.activityCategory,
        effortType: effort.effortType,
        durationSeconds: effort.durationSeconds,
        value: effort.value,
        unit: effort.unit,
        recordedAt: toIsoDateTime(effort.recordedAt),
        source: "activity_effort",
      },
    ],
    evidence: {
      ...context.evidence,
      effortCount: context.efforts.length + 1,
    },
  });
}

export function removeAthletePlanningContextEffort(
  context: AthletePlanningContext,
  effortIndex: number,
): AthletePlanningContext {
  const efforts = context.efforts.filter((_, index) => index !== effortIndex);
  return athletePlanningContextSchema.parse({
    ...context,
    efforts,
    evidence: {
      ...context.evidence,
      effortCount: efforts.length,
    },
  });
}

function getFieldValue(
  context: AthletePlanningContext,
  key: AthletePlanningContextFieldKey,
): z.infer<typeof athleteContextEvidenceValueSchema> {
  switch (key) {
    case "ageYears":
      return context.demographics.ageYears;
    case "heightCm":
      return context.body.heightCm;
    case "weightKg":
      return context.body.weightKg;
    case "bmi":
      return context.body.bmi;
    case "bodyFatPercentage":
      return context.body.bodyFatPercentage;
    case "ftpWatts":
      return context.physiology.ftpWatts;
    case "restingHeartRateBpm":
      return context.physiology.restingHeartRateBpm;
    case "maxHeartRateBpm":
      return context.physiology.maxHeartRateBpm;
    case "thresholdHeartRateBpm":
      return context.physiology.thresholdHeartRateBpm;
    case "hrvRmssdMs":
      return context.physiology.hrvRmssdMs;
    case "vo2Max":
      return context.physiology.vo2Max;
    case "currentFitnessCtl":
      return context.physiology.currentFitnessCtl;
    case "currentFatigueAtl":
      return context.physiology.currentFatigueAtl;
    case "currentFormTsb":
      return context.physiology.currentFormTsb;
    case "sleepHours":
      return context.wellness.sleepHours;
    case "hydrationLevel":
      return context.wellness.hydrationLevel;
    case "stressScore":
      return context.wellness.stressScore;
    case "sorenessLevel":
      return context.wellness.sorenessLevel;
    case "wellnessScore":
      return context.wellness.wellnessScore;
  }
}

export function selectAthletePlanningContextFields(
  context: AthletePlanningContext,
  requirements: AthletePlanningContextRequirements = {},
): AthletePlanningContextFieldDescriptor[] {
  return (Object.keys(ATHLETE_CONTEXT_FIELD_REGISTRY) as AthletePlanningContextFieldKey[]).map(
    (key) => {
      const definition = ATHLETE_CONTEXT_FIELD_REGISTRY[key];
      const originalValue = getFieldValue(context, key);
      const requiredReason = requirements[key]?.reason ?? null;
      const required = requiredReason !== null;
      const fallbackValue =
        originalValue.value === null && required ? defaultEvidenceValue(key) : null;
      const value = fallbackValue ?? originalValue;
      const hasValue = value.value !== null;

      return {
        key,
        label: definition.label,
        category: definition.category,
        inputKind: definition.inputKind,
        defaultUnit: definition.defaultUnit,
        value,
        visible: hasValue || required,
        required,
        reason: requiredReason,
        canOverride: hasValue || required,
        canRemove: !required && originalValue.value !== null,
      };
    },
  );
}
