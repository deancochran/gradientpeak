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
  const metricId = deterministicUuid(
    createHash("sha256").update(`${fixtureDigest}|metric`).digest("hex"),
  );
  const title = `Playwright Area 8 firm ${digest}`;
  const metricNote = `Playwright Area 8 FTP ${digest}`;
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
    await client.query('delete from "events" where "id" = $1 and "profile_id" = $2', [
      eventId,
      profileId,
    ]);
    await client.query('delete from "profile_metrics" where "id" = $1 and "profile_id" = $2', [
      metricId,
      profileId,
    ]);
    await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
    await client.query(
      `insert into "profile_metrics" ("id", "profile_id", "metric_type", "recorded_at", "unit", "value", "notes")
       values ($1, $2, 'ftp', now(), 'W', 250, $3)`,
      [metricId, profileId, metricNote],
    );
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
    await run(fixture);
  } finally {
    try {
      if (profileId) {
        await client.query('delete from "events" where "id" = $1 and "profile_id" = $2', [
          eventId,
          profileId,
        ]);
        await client.query('delete from "profile_metrics" where "id" = $1 and "profile_id" = $2', [
          metricId,
          profileId,
        ]);
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
