import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { activityPlanStructureHash } from "../../../application/activity-plans/structure-hash";
import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { createEventReadRepository } from "../drizzle-event-read-repository";

const pgDialect = new PgDialect();

function createEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    profile_id: "profile-1",
    event_type: "planned",
    title: "Tempo activity",
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
    scheduled_date: "2026-04-15",
    ...overrides,
  } as const;
}

function createActivityPlanRow(overrides: Record<string, unknown> = {}) {
  const structure = {
    version: 3,
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "activity",
        category: "bike",
        name: "Bike",
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                duration: { type: "time", seconds: 1800 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          },
        ],
      },
    ],
  };
  return {
    id: "activity-plan-1",
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
    profile_id: "profile-1",
    title: "Threshold bike",
    description: "Bike intervals",
    structure,
    structure_hash: activityPlanStructureHash(structure),
    gps_recording_enabled: true,
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
    name: "Morning ride",
    started_at: new Date("2026-04-15T07:03:00.000Z"),
    finished_at: new Date("2026-04-15T08:11:00.000Z"),
    elapsed_ms: 4_080_000,
    active_ms: 3_960_000,
    moving_ms: 3_900_000,
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
    limitArg: number | undefined;
    orderByArgs: unknown[];
    table: string;
    whereArg: unknown;
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

function toQuery(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as any);
}

describe("drizzle-event-read-repository", () => {
  it("derives the current Sunday-Saturday range from the owned planning timezone and marks empty sources complete", async () => {
    const { db } = createSelectCaptureDb({
      profiles: [{ planningTimezone: "America/Los_Angeles" }],
      events: [],
      activities: [],
    });
    const result = await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T01:00:00.000Z"),
      profileId: "profile-1",
    });

    expect(result).toMatchObject({
      planningTimezone: "America/Los_Angeles",
      resolvedRange: { startDate: "2026-07-19", endDate: "2026-07-25" },
      sourceCounts: { activities: 0, events: 0 },
      sourceCoverage: {
        activities: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
        scheduledItems: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
      },
    });
  });

  it("uses profile-local date bounds rather than UTC midnights for the current week read", async () => {
    const { db, selects } = createSelectCaptureDb({
      profiles: [{ planningTimezone: "America/Los_Angeles" }],
      events: [],
      activities: [],
    });

    await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T01:00:00.000Z"),
      profileId: "profile-1",
    });

    const activityQuery = toQuery(
      selects.find((select) => select.table === "activities")?.whereArg,
    );
    expect(activityQuery.params).toContain("2026-07-18T07:00:00.000Z");
    expect(activityQuery.params).toContain("2026-07-27T07:00:00.000Z");
  });

  it("reads effective-plan events by their persisted scheduled date even when starts_at is outside the UTC envelope", async () => {
    const dateAnchoredEvent = createEventRow({
      scheduled_date: "2026-07-19",
      starts_at: new Date("2026-07-18T00:00:00.000Z"),
    });
    const { db, selects } = createSelectCaptureDb({
      profiles: [{ planningTimezone: "America/Los_Angeles" }],
      events: [dateAnchoredEvent],
      activities: [],
    });

    const result = await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T01:00:00.000Z"),
      profileId: "profile-1",
    });

    expect(result.events).toMatchObject([
      {
        id: "event-1",
        scheduled_date: "2026-07-19",
        starts_at: "2026-07-18T00:00:00.000Z",
      },
    ]);
    const eventQuery = toQuery(selects.find((select) => select.table === "events")?.whereArg);
    expect(eventQuery.params).toEqual(
      expect.arrayContaining(["profile-1", "planned", "2026-07-19", "2026-07-25"]),
    );
    expect(eventQuery.params).not.toContain("2026-07-18T07:00:00.000Z");
  });

  it("uses supplied asOf for route access-grant expiry while reading current route facts", async () => {
    const { db, selects } = createSelectCaptureDb({
      profiles: [],
      activity_efforts: [],
      profile_metrics: [],
      activity_routes: [],
    });
    const repository = createEventReadRepository(db);
    const asOfIso = "2026-04-19T12:34:56.000Z";

    await repository.getEstimationInputs({
      asOfIso,
      effortCutoffIso: "2026-01-19T12:34:56.000Z",
      profileId: "profile-1",
      routeIds: ["route-1"],
    });

    const routeWhere = selects.find((select) => select.table === "activity_routes")?.whereArg;
    const query = toQuery(routeWhere);
    expect(query.sql).toContain("content_access_grants.expires_at > $");
    expect(query.sql).not.toContain("now() ");
    expect(query.params).toContainEqual(new Date(asOfIso));
  });

  it("fetches validate constraint plans by id after router permission checks", async () => {
    const { db, selects } = createSelectCaptureDb({
      training_plans: [{ id: "training-plan-1", structure: { block: "build" } }],
      activity_plans: [
        {
          id: "activity-plan-1",
          structure: createActivityPlanRow().structure,
          structure_hash: createActivityPlanRow().structure_hash,
          gps_recording_enabled: true,
          route_id: "route-1",
        },
      ],
    });
    const repository = createEventReadRepository(db);

    await expect(
      repository.getValidateConstraintsInputs({
        profileId: "profile-1",
        trainingPlanId: "training-plan-1",
        activityPlanId: "activity-plan-1",
        effortCutoffIso: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      trainingPlan: { id: "training-plan-1", structure: { block: "build" } },
      activityPlan: {
        id: "activity-plan-1",
        structure: createActivityPlanRow().structure,
        structure_hash: createActivityPlanRow().structure_hash,
        gps_recording_enabled: true,
      },
    });

    const trainingPlanWhereSql = toSql(
      selects.find((select) => select.table === "training_plans")?.whereArg,
    );
    const activityPlanWhereSql = toSql(
      selects.find((select) => select.table === "activity_plans")?.whereArg,
    );
    const selectedTables = selects.map((select) => select.table);

    expect(trainingPlanWhereSql).toContain('"training_plans"."id" = $1');
    expect(trainingPlanWhereSql).not.toContain('"training_plans"."profile_id"');
    expect(activityPlanWhereSql).toContain('"activity_plans"."id" = $1');
    expect(activityPlanWhereSql).not.toContain('"activity_plans"."profile_id"');
    expect(activityPlanWhereSql).not.toContain('"activity_plans"."is_system_template"');
    expect(selectedTables).not.toContain("activity_efforts");
  });

  it("serializes estimation inputs and skips route lookup when no route ids are provided", async () => {
    const withRoutes = createEventReadRepository(
      createQueryMapDbMock({
        profiles: {
          data: [{ dob: new Date("1992-03-04T00:00:00.000Z") }],
          error: null,
        },
        activity_efforts: {
          data: [
            {
              id: "effort-1",
              activity_id: "activity-1",
              effort_type: "power",
              duration_seconds: 1200,
              value: 287,
              unit: "watts",
              activity_category: "bike",
              recorded_at: new Date("2026-04-18T08:15:00.000Z"),
              source: "imported",
              method: "activity_file_best_effort",
              calculation_version: "activity-file-best-effort-v1",
              quality_score: 0.94,
              provenance: { activity_id: "activity-1", derived_from: "activity_file_stream" },
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
              source: "provider",
              method: "provider_import",
              calculation_version: "provider-import-v1",
              quality_score: 0.88,
              provenance: { provider: "fixture" },
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
        asOfIso: "2026-05-01T00:00:00.000Z",
        effortCutoffIso: "2026-03-01T00:00:00.000Z",
        profileId: "profile-1",
        routeIds: ["route-1"],
      }),
    ).resolves.toEqual({
      profile: { dob: "1992-03-04T00:00:00.000Z" },
      efforts: [
        {
          id: "effort-1",
          activity_id: "activity-1",
          effort_type: "power",
          duration_seconds: 1200,
          value: 287,
          unit: "watts",
          activity_category: "bike",
          recorded_at: "2026-04-18T08:15:00.000Z",
          source: "imported",
          method: "activity_file_best_effort",
          calculation_version: "activity-file-best-effort-v1",
          quality_score: 0.94,
          provenance: { activity_id: "activity-1", derived_from: "activity_file_stream" },
        },
      ],
      metrics: [
        {
          metric_type: "weight_kg",
          value: 71.4,
          recorded_at: "2026-04-01T09:30:00.000Z",
          source: "provider",
          method: "provider_import",
          calculation_version: "provider-import-v1",
          quality_score: 0.88,
          provenance: { provider: "fixture" },
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
        asOfIso: "2026-05-01T00:00:00.000Z",
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

  it("hydrates joined activity plans for owned events and detail reads", async () => {
    const activityPlan = createActivityPlanRow();
    const { db } = createQueryMapDbMock({
      events: {
        data: [
          {
            ...createEventRow(),
            activity_plan: activityPlan,
          },
        ],
        error: null,
      },
    });
    const repository = createEventReadRepository(db);

    await expect(
      repository.listOwnedEvents({
        profileId: "profile-1",
        limit: 10,
        includeAdhoc: true,
      }),
    ).resolves.toEqual([
      {
        ...createEventRow(),
        occurrence_key: "",
        created_at: "2026-04-01T10:00:00.000Z",
        starts_at: "2026-04-15T07:00:00.000Z",
        ends_at: "2026-04-15T08:15:00.000Z",
        original_starts_at: "2026-04-15T06:45:00.000Z",
        updated_at: "2026-04-02T11:00:00.000Z",
        activity_plan: {
          ...activityPlan,
          categories: ["bike"],
          primary_category: "bike",
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
      },
    ]);

    await expect(
      repository.getOwnedEventById({
        eventId: "event-1",
        profileId: "profile-1",
      }),
    ).resolves.toEqual({
      ...createEventRow(),
      occurrence_key: "",
      created_at: "2026-04-01T10:00:00.000Z",
      starts_at: "2026-04-15T07:00:00.000Z",
      ends_at: "2026-04-15T08:15:00.000Z",
      original_starts_at: "2026-04-15T06:45:00.000Z",
      updated_at: "2026-04-02T11:00:00.000Z",
      activity_plan: {
        ...activityPlan,
        categories: ["bike"],
        primary_category: "bike",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    });
  });

  it("preserves persisted schedule dates and derives legacy null dates in the event timezone", async () => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            createEventRow({
              timezone: "America/Los_Angeles",
              starts_at: new Date("2026-04-15T01:00:00.000Z"),
              scheduled_date: "2026-04-20",
            }),
            createEventRow({
              id: "event-legacy",
              timezone: "America/Los_Angeles",
              starts_at: new Date("2026-04-15T01:00:00.000Z"),
              scheduled_date: null,
            }),
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      repository.listOwnedEvents({ profileId: "profile-1", limit: 10, includeAdhoc: true }),
    ).resolves.toMatchObject([
      { id: "event-1", scheduled_date: "2026-04-20" },
      { id: "event-legacy", scheduled_date: "2026-04-14" },
    ]);
  });

  it("reads consolidated schedule-link values from the event", async () => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            {
              ...createEventRow({
                training_plan_id: "training-plan",
                activity_plan_id: "activity-plan",
                linked_activity_id: "activity",
              }),
            },
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      repository.getOwnedEventById({
        eventId: "event-1",
        profileId: "profile-1",
      }),
    ).resolves.toMatchObject({
      training_plan_id: "training-plan",
      activity_plan_id: "activity-plan",
      linked_activity_id: "activity",
    });
  });

  it("builds listOwnedEvents filters, cursor, ordering, and limit on the seam query", async () => {
    const { db, selects } = createSelectCaptureDb({
      events: [createEventRow()],
    });
    const repository = createEventReadRepository(db);

    await repository.listOwnedEvents({
      profileId: "profile-1",
      limit: 25,
      eventTypes: ["planned", "race_target"],
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
    expect(whereSql).toContain('"events"."scheduled_date" >=');
    expect(whereSql).toContain('"events"."scheduled_date" <');
    expect(whereSql).toContain('"events"."scheduled_date" is not null');
    expect(whereSql).toContain('"events"."starts_at" >=');
    expect(whereSql).toContain('"events"."starts_at" <');
    expect(whereSql).toContain('"events"."starts_at" >');
    expect(whereSql).toContain('"events"."id" >');
    expect(whereSql).toContain('"activity_plans"."structure" @>');
  });
});
