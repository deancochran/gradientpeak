import {
  activityPlanDocumentSchema,
  initializeActivityPlanDocument,
  resolveActivityPlanVariant,
} from "@repo/core/activity-plan";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
} from "@repo/core/calendar";
import { type PlannedSessionRow, schema } from "@repo/db";
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
    planned_session_id: null,
    route_id: null,
    training_plan_id: "training-plan-1",
    recurrence_rule: null,
    recurrence_timezone: null,
    series_id: null,
    occurrence_key: "",
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

function createPlannedSessionRow(overrides: Partial<PlannedSessionRow> = {}): PlannedSessionRow {
  const prescriptionDocument = activityPlanDocumentSchema.parse(createActivityPlanRow().structure);
  const prescription = structuredClone(resolveActivityPlanVariant(prescriptionDocument).structure);
  const activitySegment = prescription.segments.find((segment) => segment.role === "activity");
  const prescribedStep = activitySegment?.intervals[0]?.steps[0];
  if (!prescribedStep) throw new Error("Expected prescribed step fixture");
  prescribedStep.duration = { type: "time", seconds: 2_700 };
  const row: PlannedSessionRow = {
    id: "22222222-2222-4222-8222-222222222222",
    profile_id: "11111111-1111-4111-8111-111111111111",
    contract_version: PLANNED_SESSION_CONTRACT_VERSION,
    session_revision: 1,
    planning_date: "2026-04-15",
    original_target_date: "2026-04-15",
    source_kind: "training_plan",
    idempotency_key: "training-plan:test",
    direct_operation_id: null,
    training_plan_id: "33333333-3333-4333-8333-333333333333",
    training_plan_revision: 4,
    source_session_key: "week-1-session-2",
    series_id: null,
    occurrence_key: null,
    group_event_id: null,
    activity_plan_id: "11111111-1111-4111-8111-111111111111",
    activity_plan_revision: 7,
    activity_plan_variant_id: "99999999-9999-4999-8999-999999999999",
    activity_plan_variant_name: "Long",
    prescription_structure_hash: `v1:sha256:${"a".repeat(64)}`,
    prescription_structure: prescription,
    prescription_quantification: null,
    prescription_captured_at: new Date("2026-04-01T10:00:00.000Z"),
    status: "scheduled",
    cancellation_reason: null,
    cancelled_at: null,
    completed_activity_id: null,
    completion_state: null,
    linked_at: null,
    completion_unlinked_at: null,
    created_at: new Date("2026-04-01T10:00:00.000Z"),
    updated_at: new Date("2026-04-01T10:00:00.000Z"),
    ...overrides,
  };
  if (overrides.idempotency_key === undefined) {
    row.idempotency_key = plannedSessionIdempotencyKey(
      row.source_kind === "training_plan"
        ? {
            kind: "training_plan",
            trainingPlanId: row.training_plan_id as string,
            trainingPlanRevision: row.training_plan_revision as number,
            sourceSessionKey: row.source_session_key as string,
          }
        : row.source_kind === "recurrence"
          ? {
              kind: "recurrence",
              seriesId: row.series_id as string,
              occurrenceKey: row.occurrence_key as string,
            }
          : { kind: "direct", operationId: row.direct_operation_id as string },
    );
  }
  return row;
}

function createActivityPlanRow(overrides: Record<string, unknown> = {}) {
  const prescription = {
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "activity",
        name: "Bike",
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                name: "Step",
                duration: { type: "time", seconds: 1800 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          },
        ],
      },
    ],
  };
  const structure = initializeActivityPlanDocument({
    activityPlanId: "11111111-1111-4111-8111-111111111111",
    structure: prescription,
  });
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
    system_content_key: null,
    system_content_version: null,
    system_content_hash: null,
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
    normalized_speed_mps: 8.2,
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
    selection: Record<string, unknown> | undefined;
    table: string;
    whereArg: unknown;
  }> = [];

  const db: any = {
    $with: () => ({
      as: () => ({
        activity_plan_id: schema.events.activity_plan_id,
        id: schema.events.id,
        starts_at: schema.events.starts_at,
      }),
    }),
    with: () => db,
    select: (selection?: Record<string, unknown>) => {
      const captured = {
        table: "unknown",
        leftJoinArgs: [] as unknown[][],
        orderByArgs: [] as unknown[],
        limitArg: undefined as number | undefined,
        whereArg: undefined as unknown,
        selection,
      };
      selects.push(captured);

      const builder: any = {
        from: (table: unknown) => {
          captured.table = extractTableName(table);
          return builder;
        },
        innerJoin: (...args: unknown[]) => {
          captured.leftJoinArgs.push(args);
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

    expect(result.planningTimezone).toBe("America/Los_Angeles");
    expect(result.resolvedRange).toEqual({ startDate: "2026-07-19", endDate: "2026-07-25" });
    expect(result.sourceCounts).toEqual({ activities: 0, events: 0 });
    expect(result.sourceCoverage).toEqual({
      activities: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
      scheduledItems: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
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

  it("projects only ActivityWithSegments fields for effective-plan load inputs", async () => {
    const { db, selects } = createSelectCaptureDb({
      profiles: [{ planningTimezone: "UTC" }],
      events: [],
      activities: [],
    });

    await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T01:00:00.000Z"),
      profileId: "profile-1",
    });

    expect(
      Object.keys(selects.find((select) => select.table === "activities")?.selection ?? {}),
    ).toEqual([
      "id",
      "profile_id",
      "started_at",
      "finished_at",
      "elapsed_ms",
      "active_ms",
      "moving_ms",
      "timing_coverage",
      "distance_meters",
      "avg_heart_rate",
      "max_heart_rate",
    ]);
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
    expect(result.recommendationEvents).toMatchObject([
      {
        id: "event-1",
        original_starts_at: "2026-04-15T06:45:00.000Z",
        training_plan_id: "training-plan-1",
      },
    ]);
    expect(result.recommendationSource).toEqual({
      scheduleBatchId: null,
      status: "complete",
      trainingPlanId: "training-plan-1",
    });
    const eventQuery = toQuery(
      selects
        .filter((select) => select.table === "events")
        .find((select) => toQuery(select.whereArg).params.includes("2026-07-25"))?.whereArg,
    );
    expect(eventQuery.params).toEqual(
      expect.arrayContaining(["profile-1", "planned", "2026-07-19", "2026-07-25"]),
    );
    expect(eventQuery.params).not.toContain("2026-07-18T07:00:00.000Z");
    const recommendationQuery = [...selects]
      .filter((select) => select.table === "events")
      .map((select) => toQuery(select.whereArg))
      .find((query) => query.params.includes("training-plan-1"));
    expect(recommendationQuery?.params).toEqual(
      expect.arrayContaining(["profile-1", "planned", "training-plan-1"]),
    );
    expect(recommendationQuery?.params).not.toEqual(expect.arrayContaining(["2026-07-25"]));
  });

  it("uses the viewer planning date and hides inaccessible plans for default-going group events", async () => {
    const activityPlan = createActivityPlanRow();
    const groupEvent = {
      id: "group-event-1",
      series_id: "group-series-1",
      occurrence_key: "2026-07-21",
      title: "Club tempo ride",
      description: "Tuesday group session",
      starts_at: new Date("2026-07-21T01:00:00.000Z"),
      ends_at: new Date("2026-07-21T02:00:00.000Z"),
      timezone: "Asia/Tokyo",
      activity_plan_id: activityPlan.id,
      created_at: new Date("2026-07-01T00:00:00.000Z"),
      updated_at: new Date("2026-07-01T00:00:00.000Z"),
      activity_plan: null,
      viewer_occurrence_rsvp_status: null,
      viewer_series_rsvp_status: null,
    };
    const { db, selects } = createSelectCaptureDb({
      profiles: [{ planningTimezone: "America/Los_Angeles" }],
      events: [],
      group_memberships: [
        groupEvent,
        {
          ...groupEvent,
          id: "declined-group-event",
          viewer_occurrence_rsvp_status: "declined",
        },
        {
          ...groupEvent,
          id: "going-occurrence-overrides-declined-series",
          viewer_occurrence_rsvp_status: "going",
          viewer_series_rsvp_status: "declined",
        },
      ],
      activities: [],
    });

    const result = await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      profileId: "profile-1",
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    });

    expect(result.events).toMatchObject([
      {
        id: "going-occurrence-overrides-declined-series",
      },
      {
        id: "group-event-1",
        profile_id: "profile-1",
        event_type: "planned",
        scheduled_date: "2026-07-20",
        status: "scheduled",
        training_plan_id: null,
        linked_activity_id: null,
        activity_plan_id: null,
        activity_plan: null,
      },
    ]);
    expect(result.sourceCounts.events).toBe(2);
    const groupEventQuery = selects.find((select) => select.table === "group_memberships");
    const query = toQuery(groupEventQuery?.whereArg);
    expect(query.sql).toContain('"group_memberships"."profile_id" =');
    expect(query.sql).toContain('"group_memberships"."status" =');
    expect(query.sql).toContain('"groups"."deleted_at" is null');
    expect(query.sql).toContain('"group_events"."cancelled_at" is null');
    expect(query.sql).toContain('coalesce("group_event_rsvps"."status"');
    expect(query.sql).toContain('"group_event_series_rsvps"."status"');
    expect(query.sql).toContain("at time zone");
    expect(query.params).toEqual(
      expect.arrayContaining([
        "profile-1",
        "active",
        "profile-1",
        "America/Los_Angeles",
        "2026-07-20",
        "2026-07-26",
      ]),
    );
    const activityPlanJoin = groupEventQuery?.leftJoinArgs.at(-1);
    const activityPlanJoinQuery = toQuery(activityPlanJoin?.[1]);
    expect(activityPlanJoinQuery.sql).toContain('"activity_plans"."profile_id" =');
    expect(activityPlanJoinQuery.sql).toContain("from follows f");
    expect(activityPlanJoinQuery.sql).toContain("from content_access_grants cag");
    expect(activityPlanJoinQuery.params).toContain("profile-1");
    expect(groupEventQuery?.limitArg).toBe(10_001);
  });

  it("serializes an accessible group plan after applying the canonical viewer predicate", async () => {
    const activityPlan = createActivityPlanRow({ content_visibility: "public" });
    const { db } = createSelectCaptureDb({
      profiles: [{ planningTimezone: "UTC" }],
      events: [],
      group_memberships: [
        {
          id: "group-event-1",
          series_id: null,
          occurrence_key: null,
          title: "Public activity",
          description: null,
          starts_at: new Date("2026-07-21T07:00:00.000Z"),
          ends_at: null,
          timezone: "UTC",
          activity_plan_id: activityPlan.id,
          created_at: new Date("2026-07-01T00:00:00.000Z"),
          updated_at: new Date("2026-07-01T00:00:00.000Z"),
          activity_plan: activityPlan,
          viewer_occurrence_rsvp_status: null,
          viewer_series_rsvp_status: null,
        },
      ],
      activities: [],
    });

    const result = await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      profileId: "profile-1",
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    });

    expect(result.events).toMatchObject([
      {
        id: "group-event-1",
        activity_plan_id: "activity-plan-1",
        activity_plan: { id: "activity-plan-1" },
      },
    ]);
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
        asOf: new Date("2026-04-01T00:00:00.000Z"),
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
            scheduled_date: "2026-04-15",
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
      activity_segments: {
        data: [
          {
            id: "segment-1",
            activity_id: "activity-1",
            ordinal: 0,
            role: "activity",
            activity_category: "bike",
            start_offset_ms: 0,
            end_offset_ms: 4_080_000,
            timing_coverage: "complete",
            active_ms: 3_960_000,
            moving_ms: 3_900_000,
            summary: {
              version: 1,
              timing: { timingCoverage: "unavailable" },
              normalizedPowerWatts: 247.5,
            },
          },
        ],
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

  it("serializes current owned events to ISO strings while preserving nullable fields", async () => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            createEventRow({
              ends_at: null,
              original_starts_at: null,
              description: null,
              notes: null,
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
          description: null,
          notes: null,
        }),
        created_at: "2026-04-01T10:00:00.000Z",
        starts_at: "2026-04-15T07:00:00.000Z",
        ends_at: null,
        original_starts_at: null,
        updated_at: "2026-04-02T11:00:00.000Z",
        activity_plan: null,
        planned_session: null,
        route: null,
        occurrence_key: "",
      },
    ]);
  });

  it.each([
    "all_day",
    "occurrence_key",
    "status",
    "timezone",
    "title",
  ] as const)("rejects event rows missing the current required %s field", async (field) => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [createEventRow({ [field]: null })],
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
    ).rejects.toThrow(`Invalid event row: ${field} is required`);
  });

  it("hydrates joined activity plans for owned events and detail reads", async () => {
    const activityPlan = createActivityPlanRow();
    const route = {
      id: "route-1",
      name: "River Loop",
      description: "Rolling roads",
      total_distance: 12_000,
      total_ascent: 180,
      total_descent: 170,
    };
    const { db } = createQueryMapDbMock({
      events: {
        data: [
          {
            ...createEventRow(),
            activity_plan: activityPlan,
            activity_route: route,
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
        created_at: "2026-04-01T10:00:00.000Z",
        starts_at: "2026-04-15T07:00:00.000Z",
        ends_at: "2026-04-15T08:15:00.000Z",
        original_starts_at: "2026-04-15T06:45:00.000Z",
        updated_at: "2026-04-02T11:00:00.000Z",
        activity_plan: {
          ...activityPlan,
          activity_category: "bike",
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
        planned_session: null,
        route,
      },
    ]);

    await expect(
      repository.getOwnedEventById({
        eventId: "event-1",
        profileId: "profile-1",
      }),
    ).resolves.toEqual({
      ...createEventRow(),
      created_at: "2026-04-01T10:00:00.000Z",
      starts_at: "2026-04-15T07:00:00.000Z",
      ends_at: "2026-04-15T08:15:00.000Z",
      original_starts_at: "2026-04-15T06:45:00.000Z",
      updated_at: "2026-04-02T11:00:00.000Z",
      activity_plan: {
        ...activityPlan,
        activity_category: "bike",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
      planned_session: null,
      route,
    });
  });

  it("projects a non-default training-plan event from its immutable planned-session prescription", async () => {
    const planId = "11111111-1111-4111-8111-111111111111";
    const plannedSession = createPlannedSessionRow();
    const mutablePlan = createActivityPlanRow({
      id: planId,
      revision: 99,
      name: "Changed mutable default",
    });
    const event = createEventRow({
      activity_plan_id: planId,
      planned_session_id: plannedSession.id,
      activity_plan: mutablePlan,
      activity_route: null,
      planned_session: plannedSession,
    });
    const repository = createEventReadRepository(
      createQueryMapDbMock({ events: { data: [event], error: null } }).db,
    );

    const result = await repository.getOwnedEventById({
      eventId: event.id,
      profileId: "profile-1",
    });
    const projectedDocument = activityPlanDocumentSchema.parse(result?.activity_plan?.structure);

    expect(result?.planned_session).toMatchObject({
      id: plannedSession.id,
      sessionRevision: plannedSession.session_revision,
      source: { kind: "training_plan", trainingPlanRevision: 4 },
      prescription: {
        activityPlanId: planId,
        activityPlanRevision: 7,
        variantId: plannedSession.activity_plan_variant_id,
        variantName: "Long",
        structureHash: plannedSession.prescription_structure_hash,
        structure: plannedSession.prescription_structure,
      },
    });
    expect(resolveActivityPlanVariant(projectedDocument)).toMatchObject({
      variantId: plannedSession.activity_plan_variant_id,
      variantName: "Long",
      structure: plannedSession.prescription_structure,
    });
    expect(result?.activity_plan).toMatchObject({
      revision: 7,
      structure_hash: plannedSession.prescription_structure_hash,
    });
  });

  it("keeps repeated same-category plans and rejects mixed plans in repository-backed events", async () => {
    const baseDocument = activityPlanDocumentSchema.parse(createActivityPlanRow().structure);
    const baseStructure = resolveActivityPlanVariant(baseDocument).structure;
    const baseSegment = baseStructure.segments.find((segment) => segment.role === "activity");
    if (!baseSegment) throw new Error("Expected an activity segment fixture");
    const repeatedBike = createActivityPlanRow({
      id: "repeated-bike",
      structure: initializeActivityPlanDocument({
        activityPlanId: "22222222-2222-4222-8222-222222222222",
        structure: {
          ...baseStructure,
          segments: [
            ...baseStructure.segments,
            {
              ...baseSegment,
              id: "55555555-5555-4555-8555-555555555555",
              intervals: baseSegment.intervals.map((interval) => ({
                ...interval,
                id: "77777777-7777-4777-8777-777777777777",
                steps: interval.steps.map((step) => ({
                  ...step,
                  id: "88888888-8888-4888-8888-888888888888",
                })),
              })),
            },
          ],
        },
      }),
    });
    const mixedPlan = createActivityPlanRow({
      id: "mixed-plan",
      structure: {
        ...baseStructure,
        segments: [
          ...baseStructure.segments,
          {
            ...baseSegment,
            id: "66666666-6666-4666-8666-666666666666",
            activity_category: "run",
            intervals: baseSegment.intervals.map((interval) => ({
              ...interval,
              id: "77777777-7777-4777-8777-777777777777",
              steps: interval.steps.map((step) => ({
                ...step,
                id: "88888888-8888-4888-8888-888888888888",
                targets: [{ type: "RPE", intensity: 5 }],
              })),
            })),
          },
        ],
      },
    });
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            {
              ...createEventRow({ id: "repeated" }),
              activity_plan: repeatedBike,
              activity_route: null,
            },
            {
              ...createEventRow({ id: "mixed" }),
              activity_plan: mixedPlan,
              activity_route: null,
            },
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      repository.listOwnedEvents({ profileId: "profile-1", limit: 10, includeAdhoc: true }),
    ).rejects.toThrow("Stored activity plan is not valid");
  });

  it("rejects collection reads when a nested activity plan is invalid", async () => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            {
              ...createEventRow(),
              activity_plan: createActivityPlanRow({ structure: { version: 3, segments: [] } }),
              activity_route: null,
            },
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      repository.listOwnedEvents({ profileId: "profile-1", limit: 10, includeAdhoc: true }),
    ).rejects.toThrow("Stored activity plan is not valid");
  });

  it("preserves persisted schedule dates", async () => {
    const repository = createEventReadRepository(
      createQueryMapDbMock({
        events: {
          data: [
            createEventRow({
              timezone: "America/Los_Angeles",
              starts_at: new Date("2026-04-15T01:00:00.000Z"),
              scheduled_date: "2026-04-20",
            }),
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      repository.listOwnedEvents({ profileId: "profile-1", limit: 10, includeAdhoc: true }),
    ).resolves.toMatchObject([{ id: "event-1", scheduled_date: "2026-04-20" }]);
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
    expect(selects[0]?.leftJoinArgs).toHaveLength(3);
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
    expect(whereSql).not.toContain('"events"."scheduled_date" is not null');
    expect(whereSql).not.toContain('"events"."starts_at" >=');
    expect(whereSql).not.toContain('"events"."starts_at" <');
    expect(whereSql).toContain('"events"."starts_at" >');
    expect(whereSql).toContain('"events"."id" >');
    expect(whereSql).toContain('"activity_plans"."structure" @>');
  });

  it("uses planning-zone instants for timed events while preserving all-day date keys", async () => {
    const { db, selects } = createSelectCaptureDb({ events: [createEventRow()] });
    const repository = createEventReadRepository(db);

    await repository.listOwnedEvents({
      profileId: "profile-1",
      limit: 25,
      includeAdhoc: true,
      dateFrom: "2026-03-08",
      dateTo: "2026-03-09",
      planningTimezone: "America/New_York",
    });

    const where = selects[0]?.whereArg;
    const whereSql = toSql(where);
    const params = toQuery(where).params;
    expect(whereSql).toContain('"events"."all_day" =');
    expect(whereSql).toContain('"events"."scheduled_date" >=');
    expect(whereSql).toContain('"events"."scheduled_date" <');
    expect(whereSql).toContain('"events"."starts_at" >=');
    expect(whereSql).toContain('"events"."starts_at" <');
    expect(params).toContain("2026-03-08T05:00:00.000Z");
    expect(params).toContain("2026-03-09T04:00:00.000Z");
  });

  it("scopes planned-day summaries to active/completed planned work before ordering and bounding", async () => {
    const { db, selects } = createSelectCaptureDb({ events: [createEventRow()] });
    const repository = createEventReadRepository(db);

    await repository.listOwnedPlannedEventsForDay({
      profileId: "profile-1",
      date: "2026-04-15",
      limit: 1001,
    });

    expect(selects).toHaveLength(2);
    expect(selects[0]?.limitArg).toBe(1001);
    expect(selects[0]?.orderByArgs.map(toSql)).toEqual([
      '"events"."starts_at" asc',
      '"events"."id" asc',
    ]);
    const whereSql = toSql(selects[0]?.whereArg);
    expect(whereSql).toContain('"events"."profile_id" = $1');
    expect(whereSql).toContain('"events"."event_type" = $2');
    expect(whereSql).toContain('"events"."scheduled_date" = $3');
    expect(whereSql).toContain('"events"."status" in ($4, $5)');
    expect(toQuery(selects[0]?.whereArg).params).toEqual([
      "profile-1",
      "planned",
      "2026-04-15",
      "scheduled",
      "completed",
    ]);
    expect(selects[1]?.leftJoinArgs).toHaveLength(1);
    expect(selects[1]?.orderByArgs.map(toSql)).toEqual([
      '"events"."starts_at" asc',
      '"events"."id" asc',
    ]);
  });

  it("filters group-event plans by the canonical viewer read predicate before serialization", async () => {
    const { db, selects } = createSelectCaptureDb({ activity_plans: [] });

    await createEventReadRepository(db).listCalendarGroupActivityPlans({
      activityPlanIds: ["activity-plan-1"],
      profileId: "profile-viewer",
    });

    const query = toQuery(selects[0]?.whereArg);
    expect(query.sql).toContain('"activity_plans"."profile_id" =');
    expect(query.sql).toContain('"activity_plans"."is_system_template" =');
    expect(query.sql).toContain('"activity_plans"."content_visibility" =');
    expect(query.sql).toContain("from follows f");
    expect(query.sql).toContain("from content_access_grants cag");
    expect(query.sql).toContain("cag.access_level = 'read'");
    expect(query.params).toContain("profile-viewer");
  });
});
