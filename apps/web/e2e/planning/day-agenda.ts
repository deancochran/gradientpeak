import type { TestInfo } from "@playwright/test";
import { completedSegmentSummarySchema } from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  activities,
  activityPlans,
  activitySegments,
  plannedSessions,
  profiles,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { AuthenticatedE2EActor } from "../support/actors";
import { LocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";
import { createDirectPlannedSessionFixture } from "./planned-session";

type DayAgendaFixture = {
  activityId: string;
  completedName: string;
  date: string;
  eventId: string;
  plannedAgendaTitle: string;
  plannedPlanName: string;
};

export async function withDayAgendaFixture(
  testInfo: TestInfo,
  actor: AuthenticatedE2EActor,
  run: (fixture: DayAgendaFixture) => Promise<void>,
) {
  const identity = createE2EExecutionIdentity(testInfo);
  const day = 10 + (Number.parseInt(identity.suffix("agenda-day", 4).slice(0, 2), 16) % 10);
  const date = `2026-11-${String(day).padStart(2, "0")}`;
  const activityId = identity.uuid("agenda-activity");
  const segmentId = identity.uuid("agenda-segment");
  const completedName = identity.name("Playwright completed agenda");
  const database = new LocalE2EDatabase({ max: 1 });
  let eventId = "";
  let previousTimezone: string | null | undefined;
  let primaryError: unknown;
  try {
    const activityPlanId = actor.activityPlanId;
    if (!activityPlanId) throw new Error("The athlete day-agenda plan was not provisioned.");
    const [profile] = await database.db
      .select({ planningTimezone: profiles.planning_timezone })
      .from(profiles)
      .where(eq(profiles.id, actor.profileId))
      .limit(1);
    previousTimezone = profile?.planningTimezone;
    const [plan] = await database.db
      .select({ name: activityPlans.name })
      .from(activityPlans)
      .where(eq(activityPlans.id, activityPlanId))
      .limit(1);
    if (!plan) throw new Error("The canonical activity plan is absent.");
    await database.db
      .update(profiles)
      .set({ planning_timezone: "UTC" })
      .where(eq(profiles.id, actor.profileId));
    eventId = await createDirectPlannedSessionFixture({
      actor,
      operationId: identity.suffix("agenda-planned-session", 32),
      planningDate: date,
    });
    await database.typedTransaction(async (transaction) => {
      const finishedAt = new Date(`${date}T17:45:00.000Z`);
      await transaction.insert(activities).values({
        id: activityId,
        profile_id: actor.profileId,
        name: completedName,
        started_at: new Date(`${date}T17:00:00.000Z`),
        finished_at: finishedAt,
        elapsed_ms: 2_700_000,
        active_ms: 2_400_000,
        moving_ms: 2_400_000,
        timing_coverage: "complete",
        parser_version: "e2e-agenda-v1",
        decoded_contract_version: "e2e-agenda-v1",
        materializer_version: "e2e-agenda-v1",
        segments_generated_at: finishedAt,
        distance_meters: 8200,
      });
      await transaction.insert(activitySegments).values({
        id: segmentId,
        activity_id: activityId,
        profile_id: actor.profileId,
        ordinal: 0,
        role: "activity",
        activity_category: "run",
        start_offset_ms: 0,
        end_offset_ms: 2_700_000,
        summary: completedSegmentSummarySchema.parse({
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 2_400_000, movingMs: 2_400_000 },
          normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
        }),
        summary_version: 1,
        timing_coverage: "complete",
        active_ms: 2_400_000,
        moving_ms: 2_400_000,
        segment_revision: 1,
        parser_version: "e2e-agenda-v1",
        materializer_version: "e2e-agenda-v1",
      });
    });
    await run({
      activityId,
      completedName,
      date,
      eventId,
      plannedAgendaTitle: "bike session",
      plannedPlanName: plan.name,
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError: unknown;
  try {
    await database.typedTransaction(async (transaction) => {
      if (eventId)
        await transaction
          .delete(plannedSessions)
          .where(
            and(eq(plannedSessions.id, eventId), eq(plannedSessions.profile_id, actor.profileId)),
          );
      await transaction
        .delete(activities)
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, actor.profileId)));
      if (previousTimezone !== undefined)
        await transaction
          .update(profiles)
          .set({ planning_timezone: previousTimezone })
          .where(eq(profiles.id, actor.profileId));
    });
  } catch (error) {
    cleanupError = error;
  } finally {
    await database.close();
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
}
