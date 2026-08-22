import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { expect, test } from "../fixtures";
import { TEST_ACTIVITY_PLAN_ID, TEST_USERS } from "../utils/testData";

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Dashboard E2E fixtures only support the local database.");
  }
  return value;
}

async function withDashboardFixture(run: (dashboardTitle: string) => Promise<void>) {
  const pool = new Pool({ connectionString: localDatabaseUrl(), max: 1 });
  const client = await pool.connect();
  const eventId = randomUUID();
  const dashboardTitle = `Playwright Dashboard ${randomUUID()}`;
  let profileId: string | undefined;
  let previousTimezone: string | null | undefined;
  let previousPlanName: string | undefined;
  let setupTransactionOpen = false;
  try {
    const profile = await client.query<{ id: string }>(
      `select p."id" from "profiles" p
       inner join "users" u on u."id" = p."id"
       where lower(u."email") = lower($1) limit 1`,
      [TEST_USERS.athlete.email],
    );
    profileId = profile.rows[0]?.id;
    if (!profileId) throw new Error("The dashboard E2E profile is missing.");

    const plan = await client.query<{ id: string; name: string }>(
      'select "id", "name" from "activity_plans" where "id" = $1',
      [TEST_ACTIVITY_PLAN_ID],
    );
    if (!plan.rows[0]) throw new Error("The dashboard E2E activity plan is missing.");
    previousPlanName = plan.rows[0].name;

    previousTimezone = (
      await client.query<{ planning_timezone: string | null }>(
        'select "planning_timezone" from "profiles" where "id" = $1',
        [profileId],
      )
    ).rows[0]?.planning_timezone;
    const today = new Date();
    const scheduledDate = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + 6 - today.getUTCDay(),
      ),
    );
    const date = scheduledDate.toISOString().slice(0, 10);

    await client.query("begin");
    setupTransactionOpen = true;
    await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
    await client.query('update "activity_plans" set "name" = $2 where "id" = $1', [
      TEST_ACTIVITY_PLAN_ID,
      dashboardTitle,
    ]);
    await client.query(
      `insert into "events"
        ("id", "profile_id", "event_type", "status", "title", "all_day", "timezone",
         "starts_at", "ends_at", "scheduled_date", "activity_plan_id")
       values ($1, $2, 'planned', 'scheduled', $7, false, 'UTC',
         $3::timestamptz, $4::timestamptz, $5, $6)`,
      [
        eventId,
        profileId,
        `${date}T12:00:00.000Z`,
        `${date}T12:30:00.000Z`,
        date,
        TEST_ACTIVITY_PLAN_ID,
        dashboardTitle,
      ],
    );
    await client.query("commit");
    setupTransactionOpen = false;

    await run(dashboardTitle);
  } finally {
    if (setupTransactionOpen) await client.query("rollback").catch(() => undefined);
    await client.query("begin").catch(() => undefined);
    if (profileId) {
      await client
        .query('delete from "events" where "id" = $1 and "profile_id" = $2', [eventId, profileId])
        .catch(() => undefined);
      await client
        .query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
          profileId,
          previousTimezone ?? null,
        ])
        .catch(() => undefined);
      if (previousPlanName !== undefined) {
        await client
          .query('update "activity_plans" set "name" = $2 where "id" = $1', [
            TEST_ACTIVITY_PLAN_ID,
            previousPlanName,
          ])
          .catch(() => undefined);
      }
    }
    await client.query("commit").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

test("home.view-dashboard shows seeded plan data", async ({ athletePage }) => {
  await withDashboardFixture(async (dashboardTitle) => {
    await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    for (const title of ["Fitness", "Fatigue", "Form", "Consistency", "Active Plan"]) {
      await expect(athletePage.getByText(title, { exact: true })).toBeVisible();
    }

    await expect(athletePage.getByText(dashboardTitle, { exact: true })).toHaveCount(1);
    await expect(athletePage.getByText("Upcoming Schedule", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("Current Focus", { exact: true })).toBeVisible();
  });
});
