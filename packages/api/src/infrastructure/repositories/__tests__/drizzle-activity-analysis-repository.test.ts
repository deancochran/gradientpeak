import { DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS } from "@repo/core";
import { isSQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { createActivityAnalysisStore } from "../drizzle-activity-analysis-repository";

function getBulkLoader(store: ReturnType<typeof createActivityAnalysisStore>) {
  if (!store.loadContextEvidence) throw new Error("Expected bulk context evidence loader");
  return store.loadContextEvidence;
}

function createDbMock(options: { profileMetrics?: Array<Record<string, unknown>> } = {}) {
  const whereCalls: Array<{ fields: Record<string, unknown>; condition: unknown }> = [];
  const limits: number[] = [];
  const executions: Array<Record<string, unknown>> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const execute = () => {
      executions.push(fields);
      return Promise.resolve(
        "reference_activity_category" in fields && !("calibration_rank" in fields)
          ? (options.profileMetrics ?? [])
          : [],
      );
    };
    const builder = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      as: vi.fn(),
    };
    builder.from.mockImplementation(() => builder);
    builder.where.mockImplementation((condition: unknown) => {
      whereCalls.push({ fields, condition });
      return builder;
    });
    builder.orderBy.mockImplementation(() => builder);
    builder.limit.mockImplementation((limit: number) => {
      limits.push(limit);
      return execute();
    });
    builder.as.mockImplementation(() => fields);
    return builder;
  });
  return { db: { select } as never, executions, limits, select, whereCalls };
}

describe("createActivityAnalysisStore", () => {
  it.each([
    1, 20, 100, 525,
  ])("executes three set-based database queries for %i context requests", async (requestCount) => {
    const { db, executions } = createDbMock();
    const store = createActivityAnalysisStore(db);

    const result = await getBulkLoader(store)({
      requests: Array.from({ length: requestCount }, (_, index) => ({
        profileId: `profile-${index % 5}`,
        asOf: new Date(Date.UTC(2025, 0, 1) + index * 1000),
      })),
    });

    expect(executions).toHaveLength(3);
    expect(result).toHaveLength(Math.min(requestCount, 5));
  });

  it("does not query for an empty request set", async () => {
    const { db, select } = createDbMock();

    await expect(getBulkLoader(createActivityAnalysisStore(db))({ requests: [] })).resolves.toEqual(
      new Map(),
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("omits historical effort evidence for explicit target-based load analysis", async () => {
    const { db, executions, limits } = createDbMock();

    const result = await getBulkLoader(createActivityAnalysisStore(db))({
      requests: [{ profileId: "profile-1", asOf: new Date("2026-01-01T00:00:00.000Z") }],
      evidenceScope: "thresholds",
    });

    expect(executions).toHaveLength(2);
    expect(executions.some((fields) => "distance_meters" in fields)).toBe(false);
    expect(limits).toEqual([1414, 1]);
    expect(result.get("profile-1")?.recentEfforts).toEqual([]);
  });

  it("projects reference activity categories from the canonical segment column", async () => {
    const { db, select } = createDbMock();

    await getBulkLoader(createActivityAnalysisStore(db))({
      requests: [{ profileId: "profile-1", asOf: new Date("2026-01-01T00:00:00.000Z") }],
    });

    const projection = select.mock.calls
      .map(([fields]) => fields)
      .find((fields) => "reference_activity_category" in fields)?.reference_activity_category;
    if (!isSQLWrapper(projection)) throw new Error("Expected a SQL category projection");
    const query = new PgDialect().sqlToQuery(projection.getSQL());

    expect(query.sql).toContain("reference_segment.activity_category");
    expect(query.sql).not.toContain("reference_segment.category");
  });

  it("bounds each profile and evidence dimension with independent correlated sentinels", async () => {
    const { db, limits, whereCalls } = createDbMock();

    await getBulkLoader(createActivityAnalysisStore(db))({
      requests: [{ profileId: "profile-1", asOf: new Date("2026-01-01T00:00:00.000Z") }],
    });

    const metricCondition = whereCalls.find(
      ({ fields }) => "reference_activity_category" in fields,
    )?.condition;
    const effortCondition = whereCalls.find(({ fields }) => "distance_meters" in fields)?.condition;
    if (!isSQLWrapper(metricCondition) || !isSQLWrapper(effortCondition)) {
      throw new Error("Expected bounded calibration SQL predicates");
    }
    const dialect = new PgDialect();
    const metricQuery = dialect.sqlToQuery(metricCondition.getSQL());
    const effortQuery = dialect.sqlToQuery(effortCondition.getSQL());
    expect(metricQuery.sql).toContain('from "profile_metrics" as "activity_analysis_metric_peer"');
    expect(metricQuery.sql).toContain("is not distinct from");
    expect(effortQuery.sql).toContain('from "activity_efforts" as "activity_analysis_effort_peer"');
    expect(metricQuery.params).toContain(101);
    expect(effortQuery.params).toContain(101);
    expect(limits).toEqual([1414, 505, 1]);
  });

  it("deduplicates identical request windows before deriving the query budget", async () => {
    const { db, limits } = createDbMock();

    await getBulkLoader(createActivityAnalysisStore(db))({
      requests: Array.from({ length: 525 }, (_, index) => ({
        profileId: `profile-${index % 5}`,
        asOf: new Date("2026-01-01T00:00:00.000Z"),
      })),
    });

    expect(limits).toEqual([7070, 2525, 5]);
  });

  it("caps evidence retrieval for more than 100 historical timestamps", async () => {
    const { db, limits } = createDbMock();

    await getBulkLoader(createActivityAnalysisStore(db))({
      requests: Array.from({ length: 101 }, (_, index) => ({
        profileId: "profile-1",
        asOf: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000),
      })),
    });

    expect(limits).toEqual([25_001, 50_001, 1]);
  });

  it("bounds every evidence dimension by its own as-of, lookback, and self-exclusion window", async () => {
    const { db, whereCalls } = createDbMock();
    const olderAsOf = new Date("2025-01-01T08:00:00.000Z");
    const newerAsOf = new Date("2026-01-01T08:00:00.000Z");
    const olderLookback = new Date("2024-12-01T08:00:00.000Z");

    await getBulkLoader(createActivityAnalysisStore(db))({
      requests: [
        {
          profileId: "profile-1",
          asOf: olderAsOf,
          effortLookbackAsOf: olderLookback,
          activityIdToExclude: "activity-older",
        },
        {
          profileId: "profile-1",
          asOf: newerAsOf,
          activityIdToExclude: "activity-newer",
        },
      ],
    });

    const metricCondition = whereCalls.find(
      ({ fields }) => "reference_activity_category" in fields,
    )?.condition;
    const effortCondition = whereCalls.find(({ fields }) => "distance_meters" in fields)?.condition;
    if (!isSQLWrapper(metricCondition) || !isSQLWrapper(effortCondition)) {
      throw new Error("Expected request-window calibration SQL predicates");
    }
    const dialect = new PgDialect();
    const metricQuery = dialect.sqlToQuery(metricCondition.getSQL());
    const effortQuery = dialect.sqlToQuery(effortCondition.getSQL());

    expect(metricQuery.sql).toContain("is distinct from");
    expect(metricQuery.sql).toContain("is not distinct from");
    expect(metricQuery.params).toEqual(
      expect.arrayContaining([olderAsOf, newerAsOf, "activity-older", "activity-newer"]),
    );
    expect(effortQuery.sql).toContain("is distinct from");
    expect(effortQuery.params).toEqual(
      expect.arrayContaining([
        olderAsOf,
        newerAsOf,
        "activity-older",
        "activity-newer",
        new Date(olderLookback.getTime() - DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS * 86_400_000),
      ]),
    );
  });

  it("marks the shared evidence snapshot truncated when an explicit query cap sentinel is returned", async () => {
    const profileMetrics = Array.from({ length: 25_001 }, (_, index) => ({
      id: `metric-${index}`,
      profile_id: "profile-1",
      metric_type: "weight_kg",
      recorded_at: new Date("2025-01-01T00:00:00.000Z"),
      unit: "kg",
      value: 70,
      source: "manual",
      method: null,
      calculation_version: null,
      provenance: null,
      reference_activity_id: null,
      reference_activity_category: null,
    }));
    const { db, limits } = createDbMock({ profileMetrics });
    const result = await getBulkLoader(createActivityAnalysisStore(db))({
      requests: Array.from({ length: 18 }, (_, index) => ({
        profileId: "profile-1",
        asOf: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000),
      })),
    });

    expect(limits).toEqual([25_001, 9_090, 1]);
    expect(result.get("profile-1")).toMatchObject({
      calibrationTruncated: true,
      profileMetrics: { length: 25_000 },
    });
  });

  it.each([
    ["526 requests", Array.from({ length: 526 }, () => "profile-1")],
    ["six unique profiles", Array.from({ length: 6 }, (_, index) => `profile-${index}`)],
  ])("fails closed before querying for %s", async (_name, profileIds) => {
    const { db, select } = createDbMock();

    await expect(
      getBulkLoader(createActivityAnalysisStore(db))({
        requests: profileIds.map((profileId) => ({
          profileId,
          asOf: new Date("2026-01-01T00:00:00.000Z"),
        })),
      }),
    ).resolves.toEqual(new Map());

    expect(select).not.toHaveBeenCalled();
  });
});
