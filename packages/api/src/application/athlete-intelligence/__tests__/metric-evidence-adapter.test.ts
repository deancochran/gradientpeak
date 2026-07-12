import { describe, expect, it, vi } from "vitest";
import { MetricEvidenceAdapter } from "../adapters/metrics/metric-evidence-adapter";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const AS_OF = new Date("2026-07-10T00:00:00.000Z");

function tableName(table: unknown) {
  const tableLike = table as { _?: { name?: unknown } };
  return String(
    (table as Record<symbol, unknown> | undefined)?.[Symbol.for("drizzle:Name")] ??
      tableLike._?.name ??
      "",
  );
}

function createDb(rows: unknown[]) {
  const tables: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle's fluent builder is intentionally a bounded test double.
  const db: any = {
    select: vi.fn(() => {
      let table = "";
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle's fluent builder is intentionally a bounded test double.
      const builder: any = {
        from: (value: unknown) => {
          table = tableName(value);
          tables.push(table);
          return builder;
        },
        where: () => builder,
        orderBy: () => builder,
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return builder;
    }),
  };

  return { db, tables };
}

function policy() {
  return {
    asOf: AS_OF,
    freshnessHalfLifeDays: 10,
    weight: 0.8,
    confidence: 0.9,
    provenance: {
      policyVersion: "metric-policy-1",
      adapterVersion: "metric-adapter-1",
      lineage: [],
    },
  };
}

describe("MetricEvidenceAdapter", () => {
  it("reads the latest canonical metrics for the requested profile as of the policy time", async () => {
    const { db, tables } = createDb([
      {
        id: "old-ftp",
        profile_id: PROFILE_ID,
        metric_type: "ftp",
        recorded_at: new Date("2026-07-01T00:00:00.000Z"),
        unit: "W",
        value: 240,
        reference_activity_id: null,
      },
      {
        id: "new-ftp",
        profile_id: PROFILE_ID,
        metric_type: "ftp",
        recorded_at: new Date("2026-07-05T00:00:00.000Z"),
        unit: "W",
        value: 250,
        reference_activity_id: "activity-1",
      },
      {
        id: "future-ftp",
        profile_id: PROFILE_ID,
        metric_type: "ftp",
        recorded_at: new Date("2026-07-11T00:00:00.000Z"),
        unit: "W",
        value: 280,
        reference_activity_id: null,
      },
    ]);

    const evidence = await new MetricEvidenceAdapter(db as never).read({
      profileId: PROFILE_ID,
      metricTypes: ["ftp"],
      policy: policy(),
    });

    expect(tables).toEqual(["profile_metrics"]);
    expect(evidence).toMatchObject([
      {
        metricType: "ftp",
        canonicalUnit: "W",
        canonicalValue: 250,
        referenceActivityId: "activity-1",
        candidate: {
          capabilityId: "metric_input:ftp",
          sourceId: "new-ftp",
          correlationGroupId: "profile_metric:ftp:activity-1",
          reasons: ["metric_available", "metric_unit:W", "reference_activity:activity-1"],
        },
      },
    ]);
    expect(evidence[0]?.candidate.confidence).toBe(0.636396);
  });

  it("keeps the database read profile-scoped and does not turn another profile's row into evidence", async () => {
    const { db } = createDb([
      {
        id: "other-ftp",
        profile_id: OTHER_PROFILE_ID,
        metric_type: "ftp",
        recorded_at: new Date("2026-07-09T00:00:00.000Z"),
        unit: "W",
        value: 300,
        reference_activity_id: null,
      },
    ]);

    const evidence = await new MetricEvidenceAdapter(db as never).read({
      profileId: PROFILE_ID,
      metricTypes: ["ftp"],
      policy: policy(),
    });

    expect(evidence[0]?.candidate).toMatchObject({
      value: null,
      confidence: 0,
      reasons: ["metric_absent_as_of"],
    });
  });

  it("resolves direct canonical threshold evidence rather than treating FTP as the only threshold", async () => {
    const { db } = createDb([
      {
        id: "pace",
        profile_id: PROFILE_ID,
        metric_type: "threshold_pace_seconds_per_km",
        recorded_at: new Date("2026-07-09T00:00:00.000Z"),
        unit: "seconds_per_km",
        value: 270,
        reference_activity_id: null,
        source: "provider",
        provenance: null,
      },
      {
        id: "css",
        profile_id: PROFILE_ID,
        metric_type: "css_seconds_per_100m",
        recorded_at: new Date("2026-07-09T00:00:00.000Z"),
        unit: "seconds_per_100m",
        value: 100,
        reference_activity_id: null,
        source: "provider",
        provenance: null,
      },
    ]);

    const evidence = await new MetricEvidenceAdapter(db as never).read({
      profileId: PROFILE_ID,
      metricTypes: ["threshold_pace_seconds_per_km", "css_seconds_per_100m"],
      policy: policy(),
    });

    expect(evidence).toMatchObject([
      {
        metricType: "css_seconds_per_100m",
        canonicalValue: 100,
        candidate: { reasons: expect.arrayContaining(["canonical_threshold_source:provider"]) },
      },
      {
        metricType: "threshold_pace_seconds_per_km",
        canonicalValue: 270,
        candidate: { reasons: expect.arrayContaining(["canonical_threshold_source:provider"]) },
      },
    ]);
  });

  it("emits unknown evidence for absent, unsupported, and non-canonical metric inputs", async () => {
    const { db } = createDb([
      {
        id: "invalid-vo2",
        profile_id: PROFILE_ID,
        metric_type: "vo2_max",
        recorded_at: new Date("2026-07-09T00:00:00.000Z"),
        unit: "L/min",
        value: 4,
        reference_activity_id: null,
      },
    ]);

    const evidence = await new MetricEvidenceAdapter(db as never).read({
      profileId: PROFILE_ID,
      metricTypes: ["weight_kg", "vo2_max", "resting_hr"],
      policy: policy(),
    });

    expect(evidence.map((item) => item.candidate)).toMatchObject([
      {
        capabilityId: "metric_input:resting_hr",
        value: null,
        confidence: 0,
        reasons: ["metric_type_unsupported"],
      },
      {
        capabilityId: "metric_input:vo2_max",
        value: null,
        confidence: 0,
        reasons: ["metric_unit_not_canonical"],
      },
      {
        capabilityId: "metric_input:weight_kg",
        value: null,
        confidence: 0,
        reasons: ["metric_absent_as_of"],
      },
    ]);
  });
});
