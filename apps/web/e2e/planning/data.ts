import type { TestInfo } from "@playwright/test";
import { currentE2EActor } from "../support/actors";
import { currentE2ECleanupRegistry } from "../support/cleanup";
import { type E2EQuery, LocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";

type PlanningFixture = {
  date: string;
  endDate: string;
  eventId: string;
  startDate: string;
  title: string;
};

export type CalendarEventFixture = {
  getSeries: (anchorId: string) => Promise<
    Array<{
      id: string;
      notes: string | null;
      scheduledDate: string;
      seriesId: string | null;
      title: string;
    }>
  >;
  rememberSeries: (anchorId: string) => void;
};

export type GoalFixture = {
  getGoal: (id: string) => Promise<{
    activityCategory: string;
    priority: number;
    targetDate: string;
    targetPayload: unknown;
    title: string;
  } | null>;
  rememberGoal: (id: string) => void;
  rememberGoalTitle: (title: string) => void;
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function athleteProfileId(client: E2EQuery) {
  void client;
  return currentE2EActor("athlete").profileId;
}

function athleteActivityPlanId() {
  const id = currentE2EActor("athlete").activityPlanId;
  if (!id) throw new Error("The isolated athlete activity-plan fixture was not provisioned.");
  return id;
}

async function deletePlanningPerformanceEvidence(
  client: E2EQuery,
  profileId: string,
  activityIds: readonly string[],
) {
  await client.query(
    'delete from "activities" where "profile_id" = $1 and "id" = any($2::uuid[])',
    [profileId, activityIds],
  );
}

export async function withPlanningPathFixture(
  testInfo: TestInfo,
  run: (fixture: PlanningFixture) => Promise<void>,
) {
  const identity = createE2EExecutionIdentity(testInfo);
  const eventId = identity.uuid("planning-event");
  const performanceActivities = [0, 1].map((index) => {
    const completedAt = new Date(Date.now() - (30 + index) * 86_400_000);
    return {
      activityId: identity.uuid(`planning-performance-activity-${index}`),
      completedAt,
      segmentId: identity.uuid(`planning-performance-segment-${index}`),
      startedAt: new Date(completedAt.getTime() - 3_600_000),
    };
  });
  const title = identity.name("Playwright Area 8 firm");
  const today = new Date();
  const currentDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const weekStart = addDays(currentDate, -today.getUTCDay());
  // Keep the seeded work in the server-resolved week and not in its past portion.
  const scheduled = addDays(weekStart, 6);
  const fixture = {
    date: dateKey(scheduled),
    endDate: dateKey(addDays(currentDate, 89)),
    eventId,
    startDate: dateKey(currentDate),
    title,
  };
  const pool = new LocalE2EDatabase();
  const client = await pool.connect();
  let profileId: string | undefined;
  let planningTimezone: string | null | undefined;
  let setupTransactionOpen = false;
  try {
    profileId = await athleteProfileId(client);
    const plan = await client.query('select "id" from "activity_plans" where "id" = $1 limit 1', [
      athleteActivityPlanId(),
    ]);
    if (!plan.rows[0]) throw new Error("The canonical Area 8 activity-plan fixture is absent.");
    planningTimezone = (
      await client.query<{ planning_timezone: string | null }>(
        'select "planning_timezone" from "profiles" where "id" = $1',
        [profileId],
      )
    ).rows[0]?.planning_timezone;
    await client.query("begin");
    setupTransactionOpen = true;
    await client.query('delete from "events" where "id" = $1 and "profile_id" = $2', [
      eventId,
      profileId,
    ]);
    await deletePlanningPerformanceEvidence(
      client,
      profileId,
      performanceActivities.map(({ activityId }) => activityId),
    );
    await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
    for (const [index, activity] of performanceActivities.entries()) {
      await client.query(
        `insert into "activities" (
          "id", "profile_id", "name", "started_at", "finished_at", "elapsed_ms",
          "active_ms", "moving_ms", "timing_coverage", "parser_version",
          "decoded_contract_version", "materializer_version", "segments_generated_at"
        ) values (
          $1::uuid, $2::uuid, $3, $4::timestamptz, $5::timestamptz, 3600000,
          3600000, 3600000, 'complete', 'e2e-planning-v1',
          'e2e-planning-v1', 'e2e-planning-v1', $5::timestamptz
        )`,
        [
          activity.activityId,
          profileId,
          `Playwright planning performance evidence ${index + 1}`,
          activity.startedAt.toISOString(),
          activity.completedAt.toISOString(),
        ],
      );
      await client.query(
        `insert into "activity_segments" (
          "id", "activity_id", "profile_id", "ordinal", "role", "activity_category",
          "start_offset_ms", "end_offset_ms", "summary", "summary_version",
          "timing_coverage", "active_ms", "moving_ms", "segment_revision",
          "parser_version", "materializer_version"
        ) values (
          $1::uuid, $2::uuid, $3::uuid, 0, 'activity', 'bike',
          0, 3600000, $4::jsonb, 1,
          'complete', 3600000, 3600000, 1,
          'e2e-planning-v1', 'e2e-planning-v1'
        )`,
        [
          activity.segmentId,
          activity.activityId,
          profileId,
          JSON.stringify({
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
          }),
        ],
      );
    }
    const insertedEvent = await client.query<{ id: string }>(
      `insert into "events" ("id", "profile_id", "event_type", "status", "title", "all_day", "timezone", "starts_at", "ends_at", "scheduled_date", "activity_plan_id")
        values ($1, $2, 'planned', 'scheduled', $3, false, 'UTC', $4::timestamptz, $5::timestamptz, $6, $7)
        returning "id"`,
      [
        eventId,
        profileId,
        title,
        `${fixture.date}T12:00:00.000Z`,
        `${fixture.date}T12:30:00.000Z`,
        fixture.date,
        athleteActivityPlanId(),
      ],
    );
    const insertedEventId = insertedEvent.rows[0]?.id;
    if (!insertedEventId) throw new Error("The Area 8 firm-event fixture was not created.");
    if (insertedEventId !== fixture.eventId) {
      throw new Error("The Area 8 firm-event fixture returned an unexpected ID.");
    }
    await client.query("commit");
    setupTransactionOpen = false;
    await run(fixture);
  } finally {
    if (setupTransactionOpen) {
      await client.query("rollback");
      setupTransactionOpen = false;
    }
    try {
      if (profileId) {
        await client.query('delete from "events" where "id" = $1 and "profile_id" = $2', [
          eventId,
          profileId,
        ]);
        await deletePlanningPerformanceEvidence(
          client,
          profileId,
          performanceActivities.map(({ activityId }) => activityId),
        );
        await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
          profileId,
          planningTimezone,
        ]);
      }
    } finally {
      client.release();
      await pool.close();
    }
  }
}

/**
 * Browser journeys register only IDs they receive from the product. Cleanup never
 * searches by title, so a failed or concurrent test cannot remove another row.
 */
export async function withCalendarEventFixture(
  run: (fixture: CalendarEventFixture) => Promise<void>,
) {
  const pool = new LocalE2EDatabase();
  const client = await pool.connect();
  let profileId: string;
  try {
    profileId = await athleteProfileId(client);
  } finally {
    client.release();
  }
  const cleanup = currentE2ECleanupRegistry();
  try {
    await run({
      rememberSeries: (anchorId) => {
        cleanup.registerExactId({
          kind: "calendar-event-series",
          id: anchorId,
          cleanup: (database) =>
            database.transaction(async (query) => {
              await query.query(
                `delete from "comments" where "entity_type" = 'event' and "entity_id" in
                  (select "id" from "events" where "id" = $1 or "series_id" = $1)`,
                [anchorId],
              );
              await query.query(
                `delete from "events" where "profile_id" = $1 and ("id" = $2 or "series_id" = $2)`,
                [profileId, anchorId],
              );
            }),
        });
      },
      getSeries: async (anchorId) => {
        const result = await pool.query<{
          id: string;
          scheduled_date: string;
          series_id: string | null;
          notes: string | null;
          title: string;
        }>(
          `select "id", "scheduled_date", "series_id", "notes", "title"
           from "events"
           where "profile_id" = $1 and ("id" = $2 or "series_id" = $2)
           order by "starts_at", "id"`,
          [profileId, anchorId],
        );
        return result.rows.map((row) => {
          cleanup.registerExactId({
            kind: "calendar-event",
            id: row.id,
            cleanup: (database) =>
              database
                .query('delete from "events" where "profile_id" = $1 and "id" = $2', [
                  profileId,
                  row.id,
                ])
                .then(() => undefined),
          });
          return {
            id: row.id,
            notes: row.notes,
            scheduledDate: row.scheduled_date,
            seriesId: row.series_id,
            title: row.title,
          };
        });
      },
    });
  } finally {
    await pool.close();
  }
}

/** Browser-created goal IDs and exact unique titles are registered before inspection. */
export async function withGoalFixture(run: (fixture: GoalFixture) => Promise<void>) {
  const pool = new LocalE2EDatabase();
  const client = await pool.connect();
  let profileId: string | undefined;
  const goalIds = new Set<string>();
  const goalTitles = new Set<string>();
  const cleanup = currentE2ECleanupRegistry();
  const rememberGoal = (id: string) => {
    if (!profileId) throw new Error("The goal cleanup owner is unavailable.");
    goalIds.add(id);
    cleanup.registerExactId({
      kind: "profile-goal",
      id,
      cleanup: (database) =>
        database
          .query('delete from "profile_goals" where "profile_id" = $1 and "id" = $2', [
            profileId,
            id,
          ])
          .then(() => undefined),
    });
  };
  try {
    profileId = await athleteProfileId(client);
    await run({
      rememberGoal,
      rememberGoalTitle: (title) => goalTitles.add(title),
      getGoal: async (id) => {
        if (!profileId || !goalIds.has(id))
          throw new Error("Only registered local goal IDs may be read.");
        const result = await client.query<{
          activity_category: string;
          priority: number;
          target_date: Date | string;
          target_payload: unknown;
          title: string;
        }>(
          `select "activity_category", "priority", "target_date", "target_payload", "title"
           from "profile_goals" where "id" = $1 and "profile_id" = $2`,
          [id, profileId],
        );
        const row = result.rows[0];
        return row
          ? {
              activityCategory: row.activity_category,
              priority: row.priority,
              targetDate:
                row.target_date instanceof Date
                  ? dateKey(row.target_date)
                  : row.target_date.slice(0, 10),
              targetPayload: row.target_payload,
              title: row.title,
            }
          : null;
      },
    });
  } finally {
    try {
      if (profileId && goalTitles.size) {
        const unresolved = await client.query<{ id: string }>(
          `select "id" from "profile_goals"
           where "profile_id" = $1 and "title" = any($2::text[])`,
          [profileId, [...goalTitles]],
        );
        for (const row of unresolved.rows) rememberGoal(row.id);
      }
    } finally {
      client.release();
      await pool.close();
    }
  }
}
