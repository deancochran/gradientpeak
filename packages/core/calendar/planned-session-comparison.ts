import { z } from "zod";
import type { PlannedSessionProjection } from "./planned-session";

const nonnegativeFiniteNumberSchema = z.number().finite().nonnegative();

export const plannedSessionActualObservationSchema = z
  .object({
    durationSeconds: nonnegativeFiniteNumberSchema.nullable(),
    distanceMeters: nonnegativeFiniteNumberSchema.nullable(),
  })
  .strict();
export type PlannedSessionActualObservation = z.infer<typeof plannedSessionActualObservationSchema>;

const plannedSessionComparisonMetricSchema = z
  .object({
    value: nonnegativeFiniteNumberSchema.nullable(),
    knownCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
  })
  .strict();

export const plannedSessionComparisonSchema = z
  .object({
    planned: z
      .object({
        durationSeconds: nonnegativeFiniteNumberSchema.nullable(),
        distanceMeters: nonnegativeFiniteNumberSchema.nullable(),
      })
      .strict(),
    actual: z.discriminatedUnion("state", [
      z
        .object({
          state: z.literal("observed"),
          durationSeconds: nonnegativeFiniteNumberSchema.nullable(),
          distanceMeters: nonnegativeFiniteNumberSchema.nullable(),
          knownMetricCount: z.number().int().min(1).max(2),
          missingMetricCount: z.number().int().min(0).max(1),
        })
        .strict(),
      z
        .object({
          state: z.literal("unknown"),
          durationSeconds: z.null(),
          distanceMeters: z.null(),
          knownMetricCount: z.literal(0),
          missingMetricCount: z.literal(2),
        })
        .strict(),
      z
        .object({
          state: z.literal("not_performed"),
          reason: z.enum(["scheduled", "skipped", "cancelled", "activity_deleted"]),
        })
        .strict(),
    ]),
  })
  .strict();
export type PlannedSessionComparison = z.infer<typeof plannedSessionComparisonSchema>;

export const plannedSessionComparisonSummarySchema = z
  .object({
    planned: z
      .object({
        durationSeconds: plannedSessionComparisonMetricSchema,
        distanceMeters: plannedSessionComparisonMetricSchema,
      })
      .strict(),
    actual: z
      .object({
        durationSeconds: plannedSessionComparisonMetricSchema,
        distanceMeters: plannedSessionComparisonMetricSchema,
        observedCount: z.number().int().nonnegative(),
        unknownCount: z.number().int().nonnegative(),
        skippedCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type PlannedSessionComparisonSummary = z.infer<typeof plannedSessionComparisonSummarySchema>;

type PlannedSessionComparisonSource = {
  prescription: {
    resolutionManifest: {
      prescription_estimate: { duration: { value_seconds: number | null } };
    };
  };
  lifecycle: PlannedSessionProjection["lifecycle"];
};

export function buildPlannedSessionComparison(input: {
  session: PlannedSessionComparisonSource;
  actual: PlannedSessionActualObservation | null;
}): PlannedSessionComparison {
  const durationSeconds =
    input.session.prescription.resolutionManifest.prescription_estimate.duration.value_seconds;
  const planned = { durationSeconds, distanceMeters: null };
  const lifecycle = input.session.lifecycle;

  if (lifecycle.status === "cancelled") {
    return plannedSessionComparisonSchema.parse({
      planned,
      actual: { state: "not_performed", reason: "cancelled" },
    });
  }
  if (lifecycle.status === "scheduled") {
    return plannedSessionComparisonSchema.parse({
      planned,
      actual: { state: "not_performed", reason: "scheduled" },
    });
  }
  if (lifecycle.completion.state === "skipped") {
    return plannedSessionComparisonSchema.parse({
      planned,
      actual: { state: "not_performed", reason: "skipped" },
    });
  }
  if (lifecycle.completion.state === "activity_deleted") {
    return plannedSessionComparisonSchema.parse({
      planned,
      actual: { state: "not_performed", reason: "activity_deleted" },
    });
  }

  const actual = plannedSessionActualObservationSchema.parse(
    input.actual ?? {
      durationSeconds: null,
      distanceMeters: null,
    },
  );
  const knownMetricCount = [actual.durationSeconds, actual.distanceMeters].filter(
    (value) => value !== null,
  ).length;
  return plannedSessionComparisonSchema.parse({
    planned,
    actual:
      knownMetricCount === 0
        ? {
            state: "unknown",
            durationSeconds: null,
            distanceMeters: null,
            knownMetricCount: 0,
            missingMetricCount: 2,
          }
        : {
            state: "observed",
            ...actual,
            knownMetricCount,
            missingMetricCount: 2 - knownMetricCount,
          },
  });
}

function summarizeMetric(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null);
  return {
    value: known.length ? known.reduce((total, value) => total + value, 0) : null,
    knownCount: known.length,
    missingCount: values.length - known.length,
  };
}

export function summarizePlannedSessionComparisons(
  comparisons: readonly PlannedSessionComparison[],
): PlannedSessionComparisonSummary {
  const observed = comparisons.flatMap((comparison) =>
    comparison.actual.state === "observed" ? [comparison.actual] : [],
  );
  return plannedSessionComparisonSummarySchema.parse({
    planned: {
      durationSeconds: summarizeMetric(
        comparisons.map((comparison) => comparison.planned.durationSeconds),
      ),
      distanceMeters: summarizeMetric(
        comparisons.map((comparison) => comparison.planned.distanceMeters),
      ),
    },
    actual: {
      durationSeconds: summarizeMetric(observed.map((comparison) => comparison.durationSeconds)),
      distanceMeters: summarizeMetric(observed.map((comparison) => comparison.distanceMeters)),
      observedCount: observed.length,
      unknownCount: comparisons.filter((comparison) => comparison.actual.state === "unknown")
        .length,
      skippedCount: comparisons.filter(
        (comparison) =>
          comparison.actual.state === "not_performed" && comparison.actual.reason === "skipped",
      ).length,
    },
  });
}
