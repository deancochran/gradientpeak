import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { createEventReadRepository } from "../drizzle-event-read-repository";

const pgDialect = new PgDialect();

function createEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    idx: 1,
    profile_id: "profile-1",
    event_type: "planned_activity",
    title: "Tempo workout",
    description: "Midweek threshold session",
    all_day: false,
    timezone: "UTC",
    activity_plan_id: "activity-plan-1",
    training_plan_id: "training-plan-1",
    recurrence_rule: null,
    recurrence_timezone: null,
    series_id: null,
    source_provider: null,
    occurrence_key: null,
    original_starts_at: new Date("2026-04-15T06:45:00.000Z"),
    notes: "Bring bottles",
    status: "scheduled",
    linked_activity_id: null,
    created_at: new Date("2026-04-01T10:00:00.000Z"),
    updated_at: new Date("2026-04-02T11:00:00.000Z"),
    starts_at: new Date("2026-04-15T07:00:00.000Z"),
    ends_at: new Date("2026-04-15T08:15:00.000Z"),
    ...overrides,
  } as const;
}

function createActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "activity-plan-1",
    idx: 1,
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
    profile_id: "profile-1",
    title: "Threshold bike",
    description: "Bike intervals",
    activity_category: "bike",
    structure: { steps: [{ type: "warmup" }] },
    route_id: "route-1",
    is_public: false,
    is_system_template: false,
    source_provider: null,
    external_id: null,
    duration_seconds: null,
    distance_meters: null,
    ...overrides,
  } as const;
}

function createActivityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "activity-1",
    type: "ride",
    started_at: new Date("2026-04-15T07:03:00.000Z"),
    finished_at: new Date("2026-04-15T08:11:00.000Z"),
    duration_seconds: 4080,
    moving_seconds: 3900,
    distance_meters: 32100,
    avg_heart_rate: 151,
    max_heart_rate: 178,
    avg_power: 212,
    max_power: 402,
    avg_speed_mps: 7.9,
    max_speed_mps: 14.1,
    normalized_power: 228,
    normalized_speed_mps: 8.2,
    normalized_graded_speed_mps: 8.4,
    ...overrides,
  } as const;
}

function extractTableName(table: unknown): string {
  if (typeof table === "string") return table;
  if (table && typeof table === "object") {
    const candidate =
      (table as any)?._?.name ??
      (table as any)?._?.baseName ??
      (table as any)?._?.tableName ??
      (table as any).config?.name ??
      (table as any).tableName ??
      (table as any).name;

    if (typeof candidate === "string") {
      return candidate;
    }

    for (const symbol of Object.getOwnPropertySymbols(table)) {
      const value = (table as any)[symbol];
      if (typeof value === "string" && /^[a-z_]+$/i.test(value)) {
        return value;
      }
      if (value && typeof value === "object") {
        const symbolName = value.name ?? value.baseName ?? value.tableName;
        if (typeof symbolName === "string") {
          return symbolName;
        }
      }
    }
  }

  return "unknown";
}

function createSelectCaptureDb(rowsByTable: Record<string, unknown[]>) {
  const selects: Array<{
    leftJoinArgs: unknown[][];
    limitArg?: number;
    orderByArgs: unknown[];
    table: string;
    whereArg?: unknown;
  }> = [];

  const db: any = {
    select: () => {
      const captured = {
        table: "unknown",
        leftJoinArgs: [] as unknown[][],
        orderByArgs: [] as unknown[],
        limitArg: undefined as number | undefined,
        whereArg: undefined as unknown,
      };
      selects.push(captured);

      const builder: any = {
        from: (table: unknown) => {
          captured.table = extractTableName(table);
          return builder;
        },
        leftJoin: (...args: unknown[]) => {
          captured.leftJoinArgs.push(args);
          return builder;
        },
        where: (arg: unknown) => {
          captured.whereArg = arg;
          return builder;
        },
        orderBy: (...args: unknown[]) => {
          captured.orderByArgs = args;
          return builder;
        },
        limit: (arg: number) => {
          captured.limitArg = arg;
          return builder;
        },
        then: (onFulfilled: (value: unknown[]) => unknown) =>
          Promise.resolve(rowsByTable[captured.table] ?? []).then(onFulfilled),
      };

      return builder;
    },
  };

  return { db, selects };
}

function toSql(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as any).sql;
}

describe("drizzle-event-read-repository", () => {
  it("serializes estimation inputs and skips route lookup when no route ids are provided", async () => {
    const withRoutes = createEventReadRepository(
      createQueryMapDbMock({
        profiles: { data: [{ dob: new Date("1992-03-04T00:00:00.000Z") }], error: null },
        activity_efforts: {
          data: [
            {
              effort_type: "power",
              duration_seconds: 1200,
              value: 287,
              unit: "watts",
              activity_category: "bike",
            },
          ],
          error: null,
        },
        profile_metrics: {
          data: [
            {
              metric_type: "weight_kg",
              value: 71.4,
              recorded_at: new Date("2026-04-01T09:30:00.000Z"),
            },
          ],
          error: null,
        },
        activity_routes: {
          data: [
            {
              id: "route-1",
              distance_meters: 42000,
              total_ascent: 510,
              total_descent: 505,
              updated_at: new Date("2026-04-19T11:00:00.000Z"),
            },
          ],
          error: null,
        },
      }).db,
    );
    const withoutRoutesMock = createQueryMapDbMock({
      profiles: { data: [{ dob: null }], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });
    const withoutRoutes = createEventReadRepository(withoutRoutesMock.db);

    await expect(
      withRoutes.getEstimationInputs({
        effortCutoffIso: "2026-03-01T00:00:00.000Z",
        profileId: "profile-1",
        routeIds: ["route-1"],
      }),
    ).resolves.toEqual({
      profile: { dob: "1992-03-04T00:00:00.000Z" },
      efforts: [
        {
          effort_type: "power",
          duration_seconds: 1200,
          value: 287,
          unit: "watts",
          activity_category: "bike",
        },
      ],
      metrics: [
        {
          metric_type: "weight_kg",
          value: 71.4,
          recorded_at: "2026-04-01T09:30:00.000Z",
        },
      ],
      routes: [
        {
          id: "route-1",
          distance_meters: 42000,
          total_ascent: 510,
          total_descent: 505,
          updated_at: "2026-04-19T11:00:00.000Z",
        },
      ],
    });

    await expect(
      withoutRoutes.getEstimationInputs({
        effortCutoffIso: "2026-03-01T00:00:00.000Z",
        profileId: "profile-1",
        routeIds: [],
      }),
    ).resolves.toEqual({
      profile: { dob: null },
      efforts: [],
      metrics: [],
      routes: [],
    });
    expect(withoutRoutesMock.callLog.map((entry) => entry.table)).toEqual([
      "profiles",
      "activity_efforts",
      "profile_metrics",
    ]);
  });

  it("returns an accessible training plan projection with serialized planned and actual times", async () => {
    const { db, callLog } = createQueryMapDbMock({
      training_plans: {
        data: [{ id: "training-plan-1", structure: { block: "build" } }],
        error: null,
      },
      events: {
        data: [
          {
            starts_at: new Date("2026-04-15T07:00:00.000Z"),
            training_plan_id: "training-plan-1",
            activity_plan: createActivityPlanRow(),
          },
        ],
        error: null,
      },
      activities: {
        data: [createActivityRow()],
        error: null,
      },
    });
    const repository = createEventReadRepository(db);

    await expect(
      repository.getAccessibleTrainingPlanProjection({
        profileId: "profile-1",
        startDateIso: "2026-04-14T00:00:00.000Z",
        endDateExclusiveIso: "2026-04-16T00:00:00.000Z",
        trainingPlanId: "training-plan-1",
      }),
    ).resolves.toEqual({
      trainingPlan: { id: "training-plan-1", structure: { block: "build" } },
      plannedActivities: [
        {
          starts_at: "2026-04-15T07:00:00.000Z",
          scheduled_date: "2026-04-15",
          training_plan_id: "training-plan-1",
          activity_plan: createActivityPlanRow(),
        },
      ],
      actualActivities: [
        {
          ...createActivityRow(),
          started_at: "2026-04-15T07:03:00.000Z",
          finished_at: "2026-04-15T08:11:00.000Z",
        },
      ],
    });
    expect(callLog.map((entry) => entry.table)).toEqual(["training_plans", "events", "activities"]);
  });

  it("skips training-plan lookup when projection is requested without a plan id", async () => {
    const { db, callLog } = createQueryMapDbMock({
      events: { data: [], error: null },
      activities: { data: [], error: null },
    });
    const repository = createEventReadRepository(db);

    await expect(
      repository.getAccessibleTrainingPlanProjection({
        profileId: "profile-1",
        startDateIso: "2026-04-14T00:00:00.000Z",
        endDateExclusiveIso: "2026-04-16T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      trainingPlan: null,
      plannedActivities: [],
      actualActivities: [],
    });
    expect(callLog.map((entry) => entry.table)).toEqual(["events", "activities"]);
  });

  it("serializes owned events to ISO strings while preserving nullables", async () => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            createEventRow({
              ends_at: null,
              original_starts_at: null,
              title: null,
              description: null,
              all_day: null,
              timezone: null,
              notes: null,
              status: null,
            }),
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      repository.listOwnedEvents({
        profileId: "profile-1",
        limit: 10,
        includeAdhoc: true,
      }),
    ).resolves.toEqual([
      {
        ...createEventRow({
          ends_at: null,
          original_starts_at: null,
          title: null,
          description: null,
          all_day: null,
          timezone: null,
          notes: null,
          status: null,
        }),
        created_at: "2026-04-01T10:00:00.000Z",
        starts_at: "2026-04-15T07:00:00.000Z",
        ends_at: null,
        original_starts_at: null,
        updated_at: "2026-04-02T11:00:00.000Z",
        activity_plan: null,
        all_day: false,
        occurrence_key: "",
        status: "scheduled",
        timezone: "UTC",
        title: "",
      },
    ]);
  });

  it("builds listOwnedEvents filters, cursor, ordering, and limit on the seam query", async () => {
    const { db, selects } = createSelectCaptureDb({
      events: [createEventRow()],
    });
    const repository = createEventReadRepository(db);

    await repository.listOwnedEvents({
      profileId: "profile-1",
      limit: 25,
      eventTypes: ["planned_activity", "race"],
      includeAdhoc: false,
      activityPlanId: "activity-plan-1",
      activityCategory: "bike",
      dateFrom: "2026-04-01T00:00:00.000Z",
      dateTo: "2026-05-01T00:00:00.000Z",
      cursor: {
        id: "event-9",
        startsAt: "2026-04-20T07:00:00.000Z",
      },
    });

    expect(selects).toHaveLength(1);
    expect(selects[0]?.table).toBe("events");
    expect(selects[0]?.leftJoinArgs).toHaveLength(1);
    expect(selects[0]?.limitArg).toBe(25);
    expect(selects[0]?.orderByArgs.map(toSql)).toEqual([
      '"events"."starts_at" asc',
      '"events"."id" asc',
    ]);

    const whereSql = toSql(selects[0]?.whereArg);
    expect(whereSql).toContain('"events"."profile_id" = $1');
    expect(whereSql).toContain('"events"."event_type" in ($2, $3)');
    expect(whereSql).toContain('"events"."training_plan_id" is not null');
    expect(whereSql).toContain('"events"."activity_plan_id" = $4');
    expect(whereSql).toContain('"events"."starts_at" >= $5');
    expect(whereSql).toContain('"events"."starts_at" < $6');
    expect(whereSql).toContain('"events"."starts_at" > $7');
    expect(whereSql).toContain('"events"."starts_at" = $8 and "events"."id" > $9');
    expect(whereSql).toContain('"activity_plans"."activity_category" = $10');
  });
});
