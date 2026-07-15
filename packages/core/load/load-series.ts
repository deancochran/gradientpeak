import { z } from "zod";
import type { ActivityTssIdentity } from "../activity-analysis/contracts";

export const loadFamilySchema = z.enum([
  "tss",
  "trimp",
  "external_work_kj",
  "session_rpe",
  "distance",
  "strength_exposure",
]);

export const loadSeriesIdentitySchema = z.object({
  sport: z
    .string()
    .trim()
    .min(1)
    .refine((sport) => sport !== "all", {
      message: "Load-series identity must name one sport, not an all-sports aggregate",
    }),
  family: loadFamilySchema,
  method: z.string().trim().min(1),
  version: z.string().trim().min(1),
  sourceDefinition: z.string().trim().min(1),
});

export type LoadSeriesIdentity = z.infer<typeof loadSeriesIdentitySchema>;

/** Maps activity-level TSS evidence to its stable load-series identity. */
export function loadSeriesIdentityForActivityTss(
  identity: ActivityTssIdentity,
): LoadSeriesIdentity {
  return loadSeriesIdentitySchema.parse({
    sport: identity.sport,
    family: "tss",
    method: identity.method,
    version: identity.version,
    sourceDefinition: identity.source,
  });
}

const datedObservationSchema = z.object({ date: z.iso.date() });

export const loadDayObservationSchema = z.discriminatedUnion("state", [
  datedObservationSchema.extend({
    state: z.literal("observed"),
    value: z.number().finite().nonnegative(),
  }),
  datedObservationSchema.extend({ state: z.literal("known_zero"), value: z.literal(0) }),
  datedObservationSchema.extend({ state: z.literal("unknown"), value: z.null() }),
  datedObservationSchema.extend({
    state: z.literal("partial"),
    value: z.number().finite().nonnegative().nullable(),
  }),
]);

export type LoadDayObservation = z.infer<typeof loadDayObservationSchema>;

export const loadSeriesSchema = z.object({
  identity: loadSeriesIdentitySchema,
  observations: z.array(loadDayObservationSchema),
});

export type LoadSeries = z.infer<typeof loadSeriesSchema>;

export const loadEligibilityReasonSchema = z.enum([
  "eligible",
  "insufficient_coverage",
  "unknown_days",
  "partial_days",
  "mixed_identities",
  "identity_required",
  "no_load_data",
]);

export type LoadEligibilityReason = z.infer<typeof loadEligibilityReasonSchema>;

export const loadCoverageSchema = z.object({
  requiredDays: z.number().int().positive(),
  windowDays: z.number().int().nonnegative(),
  compatibleDays: z.number().int().nonnegative(),
  observedDays: z.number().int().nonnegative(),
  knownZeroDays: z.number().int().nonnegative(),
  unknownDays: z.number().int().nonnegative(),
  partialDays: z.number().int().nonnegative(),
  ratio: z.number().min(0).max(1),
});

export type LoadCoverage = z.infer<typeof loadCoverageSchema>;

export interface LoadSeriesEligibility {
  eligible: boolean;
  reason: LoadEligibilityReason;
  coverage: LoadCoverage;
  values: number[];
}

export function sameLoadSeriesIdentity(a: LoadSeriesIdentity, b: LoadSeriesIdentity): boolean {
  return (
    a.sport === b.sport &&
    a.family === b.family &&
    a.method === b.method &&
    a.version === b.version &&
    a.sourceDefinition === b.sourceDefinition
  );
}

export function evaluateLoadSeries(
  series: LoadSeries,
  requiredDays: number,
): LoadSeriesEligibility {
  const parsed = loadSeriesSchema.parse(series);
  const window = parsed.observations.slice(-requiredDays);
  const observedDays = window.filter(({ state }) => state === "observed").length;
  const knownZeroDays = window.filter(({ state }) => state === "known_zero").length;
  const unknownDays = window.filter(({ state }) => state === "unknown").length;
  const partialDays = window.filter(({ state }) => state === "partial").length;
  const compatibleDays = observedDays + knownZeroDays;
  const coverage: LoadCoverage = {
    requiredDays,
    windowDays: window.length,
    compatibleDays,
    observedDays,
    knownZeroDays,
    unknownDays,
    partialDays,
    ratio: requiredDays === 0 ? 0 : compatibleDays / requiredDays,
  };
  const values = window.flatMap((day) =>
    day.state === "observed" || day.state === "known_zero" ? [day.value] : [],
  );

  if (window.length === 0) return { eligible: false, reason: "no_load_data", coverage, values };
  if (unknownDays > 0) return { eligible: false, reason: "unknown_days", coverage, values };
  if (partialDays > 0) return { eligible: false, reason: "partial_days", coverage, values };
  if (compatibleDays < requiredDays) {
    return { eligible: false, reason: "insufficient_coverage", coverage, values };
  }
  return { eligible: true, reason: "eligible", coverage, values };
}

export type IdentifiedLoadObservation = LoadDayObservation & { identity: LoadSeriesIdentity };

export type LoadSeriesBuildResult =
  | { status: "available"; series: LoadSeries }
  | { status: "unavailable"; reason: "no_load_data" | "mixed_identities" };

export function buildLoadSeries(observations: IdentifiedLoadObservation[]): LoadSeriesBuildResult {
  const first = observations[0];
  if (!first) return { status: "unavailable", reason: "no_load_data" };
  if (observations.some(({ identity }) => !sameLoadSeriesIdentity(first.identity, identity))) {
    return { status: "unavailable", reason: "mixed_identities" };
  }
  return {
    status: "available",
    series: {
      identity: loadSeriesIdentitySchema.parse(first.identity),
      observations: observations.map(({ identity: _identity, ...observation }) =>
        loadDayObservationSchema.parse(observation),
      ),
    },
  };
}
