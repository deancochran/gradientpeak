import type { TestInfo } from "@playwright/test";

import { currentE2EActor } from "../support/actors";
import { LocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";

type DayAgendaFixture = {
  activityId: string;
  completedName: string;
  date: string;
  eventId: string;
  plannedPlanName: string;
};

export async function withDayAgendaFixture(
  testInfo: TestInfo,
  run: (fixture: DayAgendaFixture) => Promise<void>,
) {
  const identity = createE2EExecutionIdentity(testInfo);
  const day = 10 + (Number.parseInt(identity.suffix("agenda-day", 4).slice(0, 2), 16) % 10);
  const date = `2026-11-${String(day).padStart(2, "0")}`;
  const eventId = identity.uuid("agenda-event");
  const activityId = identity.uuid("agenda-activity");
  const segmentId = identity.uuid("agenda-segment");
  const completedName = identity.name("Playwright completed agenda");
  const pool = new LocalE2EDatabase({ max: 1 });
  let profileId = "";
  let previousTimezone: string | null = null;
  let primaryError: unknown;

  try {
    const actor = currentE2EActor("athlete");
    profileId = actor.profileId;
    const activityPlanId = actor.activityPlanId;
    if (!activityPlanId) throw new Error("The athlete day-agenda plan was not provisioned.");
    previousTimezone =
      (
        await pool.query<{ planning_timezone: string | null }>(
          'select "planning_timezone" from "profiles" where "id" = $1',
          [profileId],
        )
      ).rows[0]?.planning_timezone ?? null;
    const plan = await pool.query<{ name: string }>(
      'select "name" from "activity_plans" where "id" = $1 limit 1',
      [activityPlanId],
    );
    const plannedPlanName = plan.rows[0]?.name;
    if (!plannedPlanName) throw new Error("The canonical activity plan is absent.");

    await pool.query("begin");
    await pool.query('delete from "events" where "id" = $1 and "profile_id" = $2', [
      eventId,
      profileId,
    ]);
    await pool.query('delete from "activities" where "id" = $1 and "profile_id" = $2', [
      activityId,
      profileId,
    ]);
    await pool.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
    await pool.query(
      `insert into "events" (
         "id", "profile_id", "event_type", "status", "title", "description", "all_day",
         "timezone", "starts_at", "ends_at", "scheduled_date", "activity_plan_id"
       ) values (
         $1, $2, 'planned', 'scheduled', 'Agenda prescription', 'Planned information for the selected day',
         false, 'UTC', $3::timestamptz, $4::timestamptz, $5, $6
       )`,
      [eventId, profileId, `${date}T08:00:00.000Z`, `${date}T09:00:00.000Z`, date, activityPlanId],
    );
    await pool.query(
      `insert into "activities" (
         "id", "profile_id", "name", "started_at", "finished_at", "elapsed_ms", "active_ms",
         "moving_ms", "timing_coverage", "parser_version", "decoded_contract_version",
         "materializer_version", "segments_generated_at", "distance_meters"
       ) values (
         $1, $2, $3, $4::timestamptz, $5::timestamptz, 2700000, 2400000, 2400000,
         'complete', 'e2e-agenda-v1', 'e2e-agenda-v1', 'e2e-agenda-v1', $5::timestamptz, 8200
       )`,
      [activityId, profileId, completedName, `${date}T17:00:00.000Z`, `${date}T17:45:00.000Z`],
    );
    await pool.query(
      `insert into "activity_segments" (
         "id", "activity_id", "profile_id", "ordinal", "role", "activity_category",
         "start_offset_ms", "end_offset_ms", "summary", "summary_version", "timing_coverage",
         "active_ms", "moving_ms", "segment_revision", "parser_version", "materializer_version"
       ) values (
         $1, $2, $3, 0, 'activity', 'run', 0, 2700000,
         $4::jsonb, 1, 'complete', 2400000, 2400000, 1, 'e2e-agenda-v1', 'e2e-agenda-v1'
       )`,
      [
        segmentId,
        activityId,
        profileId,
        JSON.stringify({
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 2_400_000, movingMs: 2_400_000 },
        }),
      ],
    );
    await pool.query("commit");

    await run({ activityId, completedName, date, eventId, plannedPlanName });
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    primaryError = error;
  }

  let cleanupError: unknown;
  try {
    if (profileId) {
      await pool.query("begin");
      await pool.query('delete from "events" where "id" = $1 and "profile_id" = $2', [
        eventId,
        profileId,
      ]);
      await pool.query('delete from "activities" where "id" = $1 and "profile_id" = $2', [
        activityId,
        profileId,
      ]);
      await pool.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
        profileId,
        previousTimezone,
      ]);
      await pool.query("commit");
    }
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    cleanupError = error;
  } finally {
    await pool.close();
  }

  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
}
