import { z } from "zod";

export const activityTargetTypes = [
  "%FTP",
  "%MaxHR",
  "%ThresholdHR",
  "watts",
  "bpm",
  "speed",
  "cadence",
  "RPE",
] as const;

export const activityTargetTypeSchema = z.enum(activityTargetTypes);
export type ActivityTargetType = z.infer<typeof activityTargetTypeSchema>;

export type ActivityTargetDomain =
  | "cadence"
  | "heart_rate"
  | "perceived_effort"
  | "power"
  | "speed";

export type ActivityTargetUnit =
  | "beats_per_minute"
  | "kilometers_per_hour"
  | "percent_ftp"
  | "percent_max_heart_rate"
  | "percent_threshold_heart_rate"
  | "rating_of_perceived_exertion"
  | "revolutions_per_minute"
  | "watts";

export const activityTargetDefinitionByType = {
  "%FTP": {
    domain: "power",
    unit: "percent_ftp",
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 500,
    saveableMaximum: 300,
  },
  "%MaxHR": {
    domain: "heart_rate",
    unit: "percent_max_heart_rate",
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 200,
    saveableMaximum: 200,
  },
  "%ThresholdHR": {
    domain: "heart_rate",
    unit: "percent_threshold_heart_rate",
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 200,
    saveableMaximum: 200,
  },
  watts: { domain: "power", unit: "watts", minimum: 0, maximum: 5_000, saveableMaximum: 3_000 },
  bpm: {
    domain: "heart_rate",
    unit: "beats_per_minute",
    minimum: 30,
    maximum: 250,
    saveableMaximum: 250,
  },
  speed: {
    domain: "speed",
    unit: "kilometers_per_hour",
    minimum: 0,
    maximum: 100,
    saveableMaximum: 100,
  },
  cadence: {
    domain: "cadence",
    unit: "revolutions_per_minute",
    minimum: 0,
    maximum: 300,
    saveableMaximum: 300,
  },
  RPE: {
    domain: "perceived_effort",
    unit: "rating_of_perceived_exertion",
    minimum: 1,
    maximum: 10,
    saveableMaximum: 10,
  },
} as const satisfies Record<
  ActivityTargetType,
  {
    domain: ActivityTargetDomain;
    unit: ActivityTargetUnit;
    minimum: number;
    maximum: number;
    saveableMaximum: number;
    exclusiveMinimum?: boolean;
  }
>;

const target = <T extends ActivityTargetType>(
  type: T,
  maximumKey: "maximum" | "saveableMaximum",
) => {
  const definition = activityTargetDefinitionByType[type];
  let intensity = z.number().max(definition[maximumKey]);
  intensity =
    "exclusiveMinimum" in definition && definition.exclusiveMinimum
      ? intensity.gt(definition.minimum)
      : intensity.min(definition.minimum);
  return z.object({ type: z.literal(type), intensity }).strict();
};

export const activityTargetMaximumByType = Object.fromEntries(
  activityTargetTypes.map((type) => [type, activityTargetDefinitionByType[type].saveableMaximum]),
) as Record<ActivityTargetType, number>;

export const activityTargetDomainByType = Object.fromEntries(
  activityTargetTypes.map((type) => [type, activityTargetDefinitionByType[type].domain]),
) as Record<ActivityTargetType, ActivityTargetDomain>;

/** Canonical target discriminator, units, and accepted domain bounds. */
export const activityTargetSchema = z.discriminatedUnion("type", [
  target("%FTP", "maximum"),
  target("%MaxHR", "maximum"),
  target("%ThresholdHR", "maximum"),
  target("watts", "maximum"),
  target("bpm", "maximum"),
  target("speed", "maximum"),
  target("cadence", "maximum"),
  target("RPE", "maximum"),
]);
export type ActivityTarget = z.infer<typeof activityTargetSchema>;

/** Saveability limits for authored and persisted plans. */
export const saveableActivityTargetSchema = z.discriminatedUnion("type", [
  target("%FTP", "saveableMaximum"),
  target("%MaxHR", "saveableMaximum"),
  target("%ThresholdHR", "saveableMaximum"),
  target("watts", "saveableMaximum"),
  target("bpm", "saveableMaximum"),
  target("speed", "saveableMaximum"),
  target("cadence", "saveableMaximum"),
  target("RPE", "saveableMaximum"),
]);
