import { randomUUID } from "node:crypto";
import {
  CSS_TEST_PROTOCOL,
  type CssTestProtocolInput,
  calculateCssFrom400m200mTest,
} from "@repo/core/calculations";
import {
  activityEfforts,
  profileMetrics,
  publicActivityEffortsRowSchema,
  publicProfileMetricsRowSchema,
} from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;

export const CSS_TEST_METHOD = "css_400m_200m_test";
export const CSS_TEST_CALCULATION_VERSION = "css_400m_200m_v1";

export interface PersistCssTestInput extends CssTestProtocolInput {
  profileId: string;
  recordedAt: Date;
}

export interface PersistCssTestResult {
  testId: string;
  cssSecondsPer100m: number;
  recordedAt: Date;
  efforts: ReturnType<typeof calculateCssFrom400m200mTest>["efforts"];
  profileMetric: z.infer<typeof publicProfileMetricsRowSchema>;
}

const cssTestMetricProvenanceSchema = z.object({
  operation_id: z.string().uuid(),
  test_id: z.string().uuid(),
  input_times_seconds: z.object({
    time_400_seconds: z.number().int().positive(),
    time_200_seconds: z.number().int().positive(),
  }),
});

export class CssTestOperationConflictError extends Error {
  constructor() {
    super("CSS test operation ID was already used with different test input");
    this.name = "CssTestOperationConflictError";
  }
}

/** Inserts immutable CSS test evidence and its calculated profile metric in one transaction. */
export async function persistCssTest(
  db: DbClient,
  input: PersistCssTestInput,
): Promise<PersistCssTestResult> {
  const calculated = calculateCssFrom400m200mTest({
    time400Seconds: input.time400Seconds,
    time200Seconds: input.time200Seconds,
  });
  const testId = randomUUID();
  const effortRecords = calculated.efforts.map((effort) => ({ id: randomUUID(), effort }));
  const effortIds = effortRecords.map(({ id }) => id);
  const profileMetricId = randomUUID();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.profileId}:${input.operationId}`}, 0))`,
    );

    const [existingMetricRow] = await tx
      .select()
      .from(profileMetrics)
      .where(
        and(
          eq(profileMetrics.profile_id, input.profileId),
          eq(profileMetrics.metric_type, "css_seconds_per_100m"),
          eq(profileMetrics.method, CSS_TEST_METHOD),
          sql`${profileMetrics.provenance}->>'operation_id' = ${input.operationId}`,
        ),
      )
      .limit(1);

    if (existingMetricRow) {
      const profileMetric = publicProfileMetricsRowSchema.parse(existingMetricRow);
      const provenance = cssTestMetricProvenanceSchema.parse(profileMetric.provenance);
      const existingInput = {
        time400Seconds: provenance.input_times_seconds.time_400_seconds,
        time200Seconds: provenance.input_times_seconds.time_200_seconds,
      };
      if (
        profileMetric.recorded_at.getTime() !== input.recordedAt.getTime() ||
        existingInput.time400Seconds !== input.time400Seconds ||
        existingInput.time200Seconds !== input.time200Seconds
      ) {
        throw new CssTestOperationConflictError();
      }
      const existingCalculated = calculateCssFrom400m200mTest(existingInput);
      return {
        testId: provenance.test_id,
        cssSecondsPer100m: existingCalculated.cssSecondsPer100m,
        recordedAt: profileMetric.recorded_at,
        efforts: existingCalculated.efforts,
        profileMetric,
      };
    }

    const now = new Date();
    const insertedEfforts = await tx
      .insert(activityEfforts)
      .values(
        effortRecords.map(({ id, effort }) => ({
          id,
          profile_id: input.profileId,
          activity_id: null,
          recorded_at: input.recordedAt,
          activity_category: "swim" as const,
          effort_type: "speed" as const,
          duration_seconds: effort.durationSeconds,
          start_offset: null,
          unit: "meters_per_second",
          value: effort.speedMetersPerSecond,
          source: "test" as const,
          method: CSS_TEST_METHOD,
          calculation_version: CSS_TEST_CALCULATION_VERSION,
          quality_score: 1,
          provenance: {
            observation_type: "validated_test",
            trusted: true,
            entered_by: "athlete",
            operation_id: input.operationId,
            test_id: testId,
            protocol: CSS_TEST_PROTOCOL,
            distance_meters: effort.distanceMeters,
            derived_from: "manual_test_result",
          },
          created_at: now,
          updated_at: now,
        })),
      )
      .returning();

    publicActivityEffortsRowSchema.array().length(2).parse(insertedEfforts);
    const [insertedMetric] = await tx
      .insert(profileMetrics)
      .values({
        id: profileMetricId,
        profile_id: input.profileId,
        metric_type: "css_seconds_per_100m",
        recorded_at: input.recordedAt,
        unit: "seconds_per_100m",
        notes: null,
        reference_activity_id: null,
        value: calculated.cssSecondsPer100m,
        source: "test",
        method: CSS_TEST_METHOD,
        calculation_version: CSS_TEST_CALCULATION_VERSION,
        quality_score: 1,
        provenance: {
          observation_type: "validated_test",
          trusted: true,
          entered_by: "athlete",
          operation_id: input.operationId,
          test_id: testId,
          protocol: CSS_TEST_PROTOCOL,
          effort_ids: effortIds,
          input_distances_meters: [400, 200],
          input_times_seconds: {
            time_400_seconds: input.time400Seconds,
            time_200_seconds: input.time200Seconds,
          },
          derived_from: "manual_test_results",
        },
        created_at: now,
        updated_at: now,
      })
      .returning();

    if (!insertedMetric) throw new Error("Failed to persist CSS profile metric");

    return {
      testId,
      cssSecondsPer100m: calculated.cssSecondsPer100m,
      recordedAt: input.recordedAt,
      efforts: calculated.efforts,
      profileMetric: publicProfileMetricsRowSchema.parse(insertedMetric),
    };
  });
}
