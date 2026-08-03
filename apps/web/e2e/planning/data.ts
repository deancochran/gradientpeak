import { createHash } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import { Pool, type PoolClient } from "pg";

import { TEST_ACTIVITY_PLAN_ID, TEST_USERS } from "../utils/testData";

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

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Area 8 planning fixtures only support the local database.");
  }
  return value;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function deterministicUuid(digest: string) {
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function athleteProfileId(client: PoolClient) {
  const result = await client.query<{ id: string }>(
    `select p."id" from "profiles" p inner join "users" u on u."id" = p."id"
     where lower(u."email") = lower($1) limit 1`,
    [TEST_USERS.athlete.email],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("The local authenticated athlete fixture was not provisioned.");
  return id;
}

async function deletePlanningPerformanceEvidence(
  client: PoolClient,
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
  const fixtureDigest = createHash("sha256")
    .update(`${testInfo.project.name}|${testInfo.titlePath.join("|")}`)
    .digest("hex");
  const digest = fixtureDigest.slice(0, 12);
  const eventId = deterministicUuid(
    createHash("sha256").update(`${fixtureDigest}|event`).digest("hex"),
  );
  const performanceActivities = [0, 1].map((index) => {
    const completedAt = new Date(Date.now() - (30 + index) * 86_400_000);
    return {
      activityId: deterministicUuid(
        createHash("sha256").update(`${fixtureDigest}|performance-activity|${index}`).digest("hex"),
      ),
      completedAt,
      segmentId: deterministicUuid(
        createHash("sha256").update(`${fixtureDigest}|performance-segment|${index}`).digest("hex"),
      ),
      startedAt: new Date(completedAt.getTime() - 3_600_000),
    };
  });
  const performanceEfforts = [
    { activityIndex: 0, durationSeconds: 300, powerWatts: 320 },
    { activityIndex: 1, durationSeconds: 600, powerWatts: 280 },
    { activityIndex: 0, durationSeconds: 1_200, powerWatts: 260 },
    { activityIndex: 1, durationSeconds: 1_800, powerWatts: 253.33333333333334 },
  ].map((effort) => ({
    ...effort,
    id: deterministicUuid(
      createHash("sha256")
        .update(`${fixtureDigest}|performance-effort|${effort.durationSeconds}`)
        .digest("hex"),
    ),
  }));
  const title = `Playwright Area 8 firm ${digest}`;
  const today = new Date();
  const weekStart = addDays(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
    -today.getUTCDay(),
  );
  // Keep the seeded work in the server-resolved week and not in its past portion.
  const scheduled = addDays(weekStart, 6);
  const fixture = {
    date: dateKey(scheduled),
    endDate: dateKey(addDays(weekStart, 6)),
    eventId,
    startDate: dateKey(weekStart),
    title,
  };
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  let profileId: string | undefined;
  let planningTimezone: string | null | undefined;
  let setupTransactionOpen = false;
  try {
    profileId = await athleteProfileId(client);
    const plan = await client.query('select "id" from "activity_plans" where "id" = $1 limit 1', [
      TEST_ACTIVITY_PLAN_ID,
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
    for (const effort of performanceEfforts) {
      const activity = performanceActivities[effort.activityIndex];
      if (!activity) throw new Error("The planning performance fixture activity is absent.");
      const startOffsetSeconds = 3_600 - effort.durationSeconds;
      const completedAtSeconds = activity.completedAt.getTime() / 1_000;
      await client.query(
        `insert into "activity_efforts" (
          "id", "created_at", "updated_at", "profile_id", "activity_id", "segment_id",
          "recorded_at", "activity_category", "effort_type", "duration_seconds",
          "start_offset", "unit", "value", "source", "method", "calculation_version", "provenance"
        ) values (
          $1::uuid, $2::timestamptz, $2::timestamptz, $3::uuid, $4::uuid, $5::uuid,
          $2::timestamptz, 'bike', 'power', $6, $7, 'watts', $8,
          'imported', 'activity_file_best_effort', 'best-effort-extraction-v1', $9::jsonb
        )`,
        [
          effort.id,
          activity.completedAt.toISOString(),
          profileId,
          activity.activityId,
          activity.segmentId,
          effort.durationSeconds,
          startOffsetSeconds,
          effort.powerWatts,
          JSON.stringify({
            observation_id: effort.id,
            activity_id: activity.activityId,
            segment_id: activity.segmentId,
            derived_from: "activity_file_stream",
            source_series: "power",
            interval_convention: "current_sample_applies_to_preceding_interval",
            exact_window_start_timestamp_seconds: completedAtSeconds - effort.durationSeconds,
            exact_window_end_timestamp_seconds: completedAtSeconds,
            exact_window_start_offset_seconds: startOffsetSeconds,
            exact_window_end_offset_seconds: 3_600,
            duration_seconds: effort.durationSeconds,
            contributing_duration_seconds: effort.durationSeconds,
            window_coverage: 1,
            source_time_coverage: 1,
            extraction_status: "available",
            extraction_reason: null,
            persisted_start_offset_quantization: "floor_seconds_v1",
            calculation_version: "best-effort-extraction-v1",
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
        TEST_ACTIVITY_PLAN_ID,
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
      await pool.end();
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
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  let profileId: string;
  try {
    profileId = await athleteProfileId(client);
  } finally {
    client.release();
  }
  const anchorIds = new Set<string>();
  const eventIds = new Set<string>();
  try {
    await run({
      rememberSeries: (anchorId) => anchorIds.add(anchorId),
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
          eventIds.add(row.id);
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
    try {
      if (eventIds.size > 0) {
        await pool.query(
          'delete from "events" where "profile_id" = $1 and "id" = any($2::uuid[])',
          [profileId, [...eventIds]],
        );
      }
      for (const anchorId of anchorIds) {
        await pool.query(
          `delete from "events"
           where "profile_id" = $1 and ("id" = $2 or "series_id" = $2)`,
          [profileId, anchorId],
        );
      }
    } finally {
      await pool.end();
    }
  }
}

/** Browser-created goal IDs and exact unique titles are registered before inspection. */
export async function withGoalFixture(run: (fixture: GoalFixture) => Promise<void>) {
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  let profileId: string | undefined;
  const goalIds = new Set<string>();
  const goalTitles = new Set<string>();
  try {
    profileId = await athleteProfileId(client);
    await run({
      rememberGoal: (id) => goalIds.add(id),
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
      if (profileId && (goalIds.size || goalTitles.size)) {
        await client.query(
          `delete from "profile_goals"
           where "profile_id" = $1
             and ("id" = any($2::uuid[]) or "title" = any($3::text[]))`,
          [profileId, [...goalIds], [...goalTitles]],
        );
      }
    } finally {
      client.release();
      await pool.end();
    }
  }
}
