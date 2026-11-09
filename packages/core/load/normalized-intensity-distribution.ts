import { z } from "zod";

import { getTrainingIntensityZone } from "../zones/intensity";

export const NORMALIZED_INTENSITY_DISTRIBUTION_MAX_OBSERVATIONS = 500;

export const normalizedIntensityBandSchema = z.enum([
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2max",
  "anaerobic",
  "neuromuscular",
]);
export type NormalizedIntensityBand = z.infer<typeof normalizedIntensityBandSchema>;

/**
 * Canonical normalized-intensity bands. Lower bounds are inclusive, upper bounds
 * are exclusive, except the final band which includes the model maximum of 1.5.
 */
export const NORMALIZED_INTENSITY_BANDS = [
  { band: "recovery", minimumIntensity: 0, maximumIntensity: 0.55 },
  { band: "endurance", minimumIntensity: 0.55, maximumIntensity: 0.75 },
  { band: "tempo", minimumIntensity: 0.75, maximumIntensity: 0.85 },
  { band: "threshold", minimumIntensity: 0.85, maximumIntensity: 0.95 },
  { band: "vo2max", minimumIntensity: 0.95, maximumIntensity: 1.05 },
  { band: "anaerobic", minimumIntensity: 1.05, maximumIntensity: 1.15 },
  { band: "neuromuscular", minimumIntensity: 1.15, maximumIntensity: 1.5 },
] as const satisfies readonly {
  band: NormalizedIntensityBand;
  minimumIntensity: number;
  maximumIntensity: number;
}[];

export const normalizedIntensityDistributionBandSchema = z
  .object({
    band: normalizedIntensityBandSchema,
    minimumIntensity: z.number().finite().min(0).max(1.5),
    maximumIntensity: z.number().finite().min(0).max(1.5),
    durationSeconds: z.number().finite().nonnegative(),
    percentage: z.number().finite().min(0).max(100),
  })
  .strict();

export const normalizedIntensityDistributionSchema = z
  .object({
    status: z.enum(["complete", "partial", "known_zero", "unavailable"]),
    contributingDurationSeconds: z.number().finite().nonnegative().nullable(),
    bands: z.array(normalizedIntensityDistributionBandSchema).max(7),
  })
  .strict()
  .superRefine((distribution, context) => {
    if (distribution.status === "unavailable") {
      if (distribution.contributingDurationSeconds !== null || distribution.bands.length !== 0) {
        context.addIssue({
          code: "custom",
          message: "Unavailable intensity distributions cannot claim duration or band values",
        });
      }
      return;
    }
    if (distribution.bands.length !== NORMALIZED_INTENSITY_BANDS.length) {
      context.addIssue({
        code: "custom",
        path: ["bands"],
        message: "Available intensity distributions require every canonical band",
      });
      return;
    }
    for (const [index, expected] of NORMALIZED_INTENSITY_BANDS.entries()) {
      const actual = distribution.bands[index];
      if (
        !actual ||
        actual.band !== expected.band ||
        actual.minimumIntensity !== expected.minimumIntensity ||
        actual.maximumIntensity !== expected.maximumIntensity
      ) {
        context.addIssue({
          code: "custom",
          path: ["bands", index],
          message: "Intensity distribution bands must use canonical order and boundaries",
        });
      }
    }
    const duration = distribution.bands.reduce((total, band) => total + band.durationSeconds, 0);
    const durationTolerance = Number.EPSILON * Math.max(1, duration) * 32;
    if (
      distribution.contributingDurationSeconds === null ||
      Math.abs(distribution.contributingDurationSeconds - duration) > durationTolerance
    ) {
      context.addIssue({
        code: "custom",
        path: ["contributingDurationSeconds"],
        message: "Intensity distribution duration must equal its band durations",
      });
    }
    const percentage = distribution.bands.reduce((total, band) => total + band.percentage, 0);
    if (distribution.status === "known_zero") {
      if (duration !== 0 || percentage !== 0) {
        context.addIssue({
          code: "custom",
          message: "Known-zero intensity distributions require zero duration and percentages",
        });
      }
    } else if (duration <= 0 || Math.abs(percentage - 100) > 0.001) {
      context.addIssue({
        code: "custom",
        message: "Positive intensity distributions must normalize to 100 percent",
      });
    }
  });
export type NormalizedIntensityDistribution = z.infer<typeof normalizedIntensityDistributionSchema>;

const normalizedIntensityDistributionObservationSchema = z
  .object({
    status: z.enum(["complete", "partial", "known_zero", "unavailable"]),
    intensity: z.number().finite().min(0).max(1.5).nullable(),
    durationSeconds: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .superRefine((observation, context) => {
    const valid =
      observation.status === "unavailable"
        ? observation.intensity === null && observation.durationSeconds === null
        : observation.status === "known_zero"
          ? observation.intensity === null && observation.durationSeconds === 0
          : observation.intensity !== null &&
            observation.durationSeconds !== null &&
            observation.durationSeconds > 0;
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: `Intensity observation values do not match ${observation.status} status`,
      });
    }
  });

const normalizedIntensityDistributionInputSchema = z
  .object({
    sourceStatus: z.enum(["complete", "partial", "unavailable"]),
    observations: z
      .array(normalizedIntensityDistributionObservationSchema)
      .max(NORMALIZED_INTENSITY_DISTRIBUTION_MAX_OBSERVATIONS),
  })
  .strict();
export type NormalizedIntensityDistributionInput = z.input<
  typeof normalizedIntensityDistributionInputSchema
>;

function stableSum(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right).reduce((total, value) => total + value, 0);
}

function canonicalZeroBands() {
  return NORMALIZED_INTENSITY_BANDS.map((band) => ({
    ...band,
    durationSeconds: 0,
    percentage: 0,
  }));
}

function normalizedPercentages(durations: readonly number[], totalDuration: number): number[] {
  const exactHundredths = durations.map((duration) => (duration / totalDuration) * 10_000);
  const hundredths = exactHundredths.map(Math.floor);
  let remainder = 10_000 - hundredths.reduce((total, value) => total + value, 0);
  const allocationOrder = exactHundredths
    .map((value, index) => ({ fraction: value - Math.floor(value), index }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const allocation of allocationOrder) {
    if (remainder <= 0) break;
    const current = hundredths[allocation.index];
    if (current === undefined) continue;
    hundredths[allocation.index] = current + 1;
    remainder -= 1;
  }
  return hundredths.map((value) => value / 100);
}

/**
 * Builds a deterministic duration share across the canonical normalized-intensity
 * bands. Partial observations retain their known durations; unavailable source
 * coverage never publishes a numeric subtotal. Output is fixed at seven bands.
 */
export function buildNormalizedIntensityDistribution(
  input: NormalizedIntensityDistributionInput,
): NormalizedIntensityDistribution {
  const parsed = normalizedIntensityDistributionInputSchema.parse(input);
  if (parsed.sourceStatus === "unavailable") {
    return normalizedIntensityDistributionSchema.parse({
      status: "unavailable",
      contributingDurationSeconds: null,
      bands: [],
    });
  }

  const durationsByBand = new Map<NormalizedIntensityBand, number[]>();
  for (const observation of parsed.observations) {
    if (
      observation.status === "unavailable" ||
      observation.status === "known_zero" ||
      observation.intensity === null ||
      observation.durationSeconds === null
    ) {
      continue;
    }
    const band = getTrainingIntensityZone(observation.intensity);
    const durations = durationsByBand.get(band) ?? [];
    durations.push(observation.durationSeconds);
    durationsByBand.set(band, durations);
  }
  const durations = NORMALIZED_INTENSITY_BANDS.map(({ band }) =>
    stableSum(durationsByBand.get(band) ?? []),
  );
  const totalDuration = stableSum(durations);
  if (totalDuration === 0) {
    const status =
      parsed.sourceStatus === "complete" &&
      parsed.observations.every((observation) => observation.status === "known_zero")
        ? "known_zero"
        : "unavailable";
    return normalizedIntensityDistributionSchema.parse(
      status === "known_zero"
        ? { status, contributingDurationSeconds: 0, bands: canonicalZeroBands() }
        : { status, contributingDurationSeconds: null, bands: [] },
    );
  }

  const percentages = normalizedPercentages(durations, totalDuration);
  const status =
    parsed.sourceStatus === "partial" ||
    parsed.observations.some(
      (observation) => observation.status === "partial" || observation.status === "unavailable",
    )
      ? "partial"
      : "complete";
  return normalizedIntensityDistributionSchema.parse({
    status,
    contributingDurationSeconds: totalDuration,
    bands: NORMALIZED_INTENSITY_BANDS.map((band, index) => ({
      ...band,
      durationSeconds: durations[index] ?? 0,
      percentage: percentages[index] ?? 0,
    })),
  });
}
