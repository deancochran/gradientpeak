import { z } from "zod";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const zoneRangeSchema = z
  .object({
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const thresholdSourceSchema = z.discriminatedUnion("availability", [
  z
    .object({
      availability: z.literal("available"),
      value: z.number().finite().positive(),
      unit: z.literal("watts"),
      state: z.enum(["provisional", "confirmed"]),
      freshness: z.enum(["fresh", "stale"]),
      effectiveAt: instantSchema,
      policyVersion: z.string().trim().min(1),
      method: z.literal("bike_power_30m"),
      calculationVersion: z.string().trim().min(1),
      provenance: z.literal("validated_threshold"),
    })
    .strict(),
  z
    .object({
      availability: z.literal("unavailable"),
      value: z.null(),
      unit: z.literal("watts"),
      state: z.literal("unavailable"),
      freshness: z.literal("unavailable"),
      effectiveAt: z.null(),
      policyVersion: z.null(),
      method: z.null(),
      calculationVersion: z.null(),
      provenance: z.literal("unavailable"),
    })
    .strict(),
]);

const heartRateSourceSchema = z.discriminatedUnion("availability", [
  z
    .object({
      availability: z.literal("available"),
      value: z.number().finite().min(30).max(250),
      unit: z.literal("beats_per_minute"),
      state: z.enum(["provisional", "confirmed", "stale"]),
      freshness: z.enum(["fresh", "stale"]),
      effectiveAt: instantSchema,
      policyVersion: z.string().trim().min(1),
      method: z.literal("activity_file_lthr_detection"),
      calculationVersion: z.string().trim().min(1),
      provenance: z.literal("validated_threshold"),
    })
    .strict(),
  z
    .object({
      availability: z.literal("unavailable"),
      value: z.null(),
      unit: z.literal("beats_per_minute"),
      state: z.literal("unavailable"),
      freshness: z.literal("unavailable"),
      effectiveAt: z.null(),
      policyVersion: z.null(),
      method: z.null(),
      calculationVersion: z.null(),
      provenance: z.literal("unavailable"),
    })
    .strict(),
]);

export const coachAthleteZonesRequestSchema = z
  .object({ organizationId: uuidSchema, athleteProfileId: uuidSchema })
  .strict();

export const coachAthleteZonesResponseSchema = z
  .object({
    asOf: instantSchema,
    sport: z.literal("bike"),
    publication: z
      .object({
        status: z.enum(["available", "stale", "unavailable"]),
        publishedRevision: z.number().int().nonnegative().nullable(),
        computedAt: instantSchema.nullable(),
      })
      .strict(),
    power: z
      .object({
        source: thresholdSourceSchema,
        zoneAvailability: z.enum(["available", "unavailable"]),
        policyVersion: z.literal("cycling_ftp_zones_v1").nullable(),
        zones: z
          .object({
            zone1: zoneRangeSchema,
            zone2: zoneRangeSchema,
            zone3: zoneRangeSchema,
            zone4: zoneRangeSchema,
            zone5: zoneRangeSchema,
            zone6: zoneRangeSchema,
            zone7: zoneRangeSchema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
    heartRate: z
      .object({
        source: heartRateSourceSchema,
        zoneAvailability: z.enum(["available", "unavailable"]),
        policyVersion: z.literal("sport_lthr_zones_v1").nullable(),
        zones: z
          .object({
            zone1: zoneRangeSchema,
            zone2: zoneRangeSchema,
            zone3: zoneRangeSchema,
            zone4: zoneRangeSchema,
            zone5: zoneRangeSchema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

export type CoachAthleteZonesResponse = z.infer<typeof coachAthleteZonesResponseSchema>;
