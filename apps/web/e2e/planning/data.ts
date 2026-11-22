import type { TestInfo } from "@playwright/test";
import {
  activities,
  activityPlans,
  activitySegments,
  comments,
  events,
  plannedSessions,
  profileGoals,
  profiles,
} from "@repo/db/schema";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { currentE2EActor } from "../support/actors";
import { currentE2ECleanupRegistry } from "../support/cleanup";
import { LocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";
import { createDirectPlannedSessionFixture } from "./planned-session";

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

function athleteActivityPlanId() {
  const id = currentE2EActor("athlete").activityPlanId;
  if (!id) throw new Error("The isolated athlete activity-plan fixture was not provisioned.");
  return id;
}

export async function withPlanningPathFixture(
  testInfo: TestInfo,
  run: (fixture: PlanningFixture) => Promise<void>,
) {
  const identity = createE2EExecutionIdentity(testInfo);
  const actor = currentE2EActor("athlete");
  const activityPlanId = athleteActivityPlanId();
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
  const scheduled = addDays(weekStart, 6);
  const fixture = {
    date: dateKey(scheduled),
    endDate: dateKey(addDays(currentDate, 89)),
    eventId: "",
    startDate: dateKey(currentDate),
    title,
  };
  const database = new LocalE2EDatabase();
  let planningTimezone: string | null | undefined;
  try {
    const [plan] = await database.db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(eq(activityPlans.id, activityPlanId))
      .limit(1);
    if (!plan) throw new Error("The canonical Area 8 activity-plan fixture is absent.");
    const [profile] = await database.db
      .select({ planningTimezone: profiles.planning_timezone })
      .from(profiles)
      .where(eq(profiles.id, actor.profileId))
      .limit(1);
    planningTimezone = profile?.planningTimezone;
    await database.typedTransaction(async (transaction) => {
      await transaction.delete(activities).where(
        and(
          eq(activities.profile_id, actor.profileId),
          inArray(
            activities.id,
            performanceActivities.map(({ activityId }) => activityId),
          ),
        ),
      );
      await transaction
        .update(profiles)
        .set({ planning_timezone: "UTC" })
        .where(eq(profiles.id, actor.profileId));
      for (const [index, activity] of performanceActivities.entries()) {
        await transaction.insert(activities).values({
          id: activity.activityId,
          profile_id: actor.profileId,
          name: `Playwright planning performance evidence ${index + 1}`,
          started_at: activity.startedAt,
          finished_at: activity.completedAt,
          elapsed_ms: 3_600_000,
          active_ms: 3_600_000,
          moving_ms: 3_600_000,
          timing_coverage: "complete",
          parser_version: "e2e-planning-v1",
          decoded_contract_version: "e2e-planning-v1",
          materializer_version: "e2e-planning-v1",
          segments_generated_at: activity.completedAt,
        });
        await transaction.insert(activitySegments).values({
          id: activity.segmentId,
          activity_id: activity.activityId,
          profile_id: actor.profileId,
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          start_offset_ms: 0,
          end_offset_ms: 3_600_000,
          summary: {
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
          },
          summary_version: 1,
          timing_coverage: "complete",
          active_ms: 3_600_000,
          moving_ms: 3_600_000,
          segment_revision: 1,
          parser_version: "e2e-planning-v1",
          materializer_version: "e2e-planning-v1",
        });
      }
    });
    fixture.eventId = await createDirectPlannedSessionFixture({
      actor,
      operationId: identity.suffix("planning-planned-session", 32),
      planningDate: fixture.date,
    });
    await run(fixture);
  } finally {
    try {
      await database.typedTransaction(async (transaction) => {
        if (fixture.eventId)
          await transaction
            .delete(plannedSessions)
            .where(
              and(
                eq(plannedSessions.id, fixture.eventId),
                eq(plannedSessions.profile_id, actor.profileId),
              ),
            );
        await transaction.delete(activities).where(
          and(
            eq(activities.profile_id, actor.profileId),
            inArray(
              activities.id,
              performanceActivities.map(({ activityId }) => activityId),
            ),
          ),
        );
        if (planningTimezone !== undefined)
          await transaction
            .update(profiles)
            .set({ planning_timezone: planningTimezone })
            .where(eq(profiles.id, actor.profileId));
      });
    } finally {
      await database.close();
    }
  }
}

/** Browser journeys register only IDs they receive from the product. Cleanup never searches by title, so a failed or concurrent test cannot remove another row. */
export async function withCalendarEventFixture(
  run: (fixture: CalendarEventFixture) => Promise<void>,
) {
  const database = new LocalE2EDatabase();
  const profileId = currentE2EActor("athlete").profileId;
  const cleanup = currentE2ECleanupRegistry();
  try {
    await run({
      rememberSeries: (anchorId) =>
        cleanup.registerExactId({
          kind: "calendar-event-series",
          id: anchorId,
          cleanup: (cleanupDatabase) =>
            cleanupDatabase.typedTransaction(async (transaction) => {
              const matchingEvents = await transaction
                .select({ id: events.id })
                .from(events)
                .where(
                  and(
                    eq(events.profile_id, profileId),
                    or(eq(events.id, anchorId), eq(events.series_id, anchorId)),
                  ),
                );
              if (matchingEvents.length)
                await transaction.delete(comments).where(
                  and(
                    eq(comments.entity_type, "event"),
                    inArray(
                      comments.entity_id,
                      matchingEvents.map((event) => event.id),
                    ),
                  ),
                );
              await transaction
                .delete(events)
                .where(
                  and(
                    eq(events.profile_id, profileId),
                    or(eq(events.id, anchorId), eq(events.series_id, anchorId)),
                  ),
                );
            }),
        }),
      getSeries: async (anchorId) => {
        const rows = await database.db
          .select({
            id: events.id,
            scheduledDate: events.scheduled_date,
            seriesId: events.series_id,
            notes: events.notes,
            title: events.title,
          })
          .from(events)
          .where(
            and(
              eq(events.profile_id, profileId),
              or(eq(events.id, anchorId), eq(events.series_id, anchorId)),
            ),
          )
          .orderBy(asc(events.starts_at), asc(events.id));
        for (const row of rows)
          cleanup.registerExactId({
            kind: "calendar-event",
            id: row.id,
            cleanup: (cleanupDatabase) =>
              cleanupDatabase.db
                .delete(events)
                .where(and(eq(events.profile_id, profileId), eq(events.id, row.id)))
                .then(() => undefined),
          });
        return rows;
      },
    });
  } finally {
    await database.close();
  }
}

/** Browser-created goal IDs and exact unique titles are registered before inspection. */
export async function withGoalFixture(run: (fixture: GoalFixture) => Promise<void>) {
  const database = new LocalE2EDatabase();
  const profileId = currentE2EActor("athlete").profileId;
  const goalIds = new Set<string>();
  const goalTitles = new Set<string>();
  const cleanup = currentE2ECleanupRegistry();
  const rememberGoal = (id: string) => {
    goalIds.add(id);
    cleanup.registerExactId({
      kind: "profile-goal",
      id,
      cleanup: (cleanupDatabase) =>
        cleanupDatabase.db
          .delete(profileGoals)
          .where(and(eq(profileGoals.profile_id, profileId), eq(profileGoals.id, id)))
          .then(() => undefined),
    });
  };
  try {
    await run({
      rememberGoal,
      rememberGoalTitle: (title) => goalTitles.add(title),
      getGoal: async (id) => {
        if (!goalIds.has(id)) throw new Error("Only registered local goal IDs may be read.");
        const [goal] = await database.db
          .select({
            activityCategory: profileGoals.activity_category,
            priority: profileGoals.priority,
            targetDate: profileGoals.target_date,
            targetPayload: profileGoals.target_payload,
            title: profileGoals.title,
          })
          .from(profileGoals)
          .where(and(eq(profileGoals.id, id), eq(profileGoals.profile_id, profileId)));
        return goal ?? null;
      },
    });
  } finally {
    try {
      if (goalTitles.size) {
        const unresolved = await database.db
          .select({ id: profileGoals.id })
          .from(profileGoals)
          .where(
            and(
              eq(profileGoals.profile_id, profileId),
              inArray(profileGoals.title, [...goalTitles]),
            ),
          );
        for (const goal of unresolved) rememberGoal(goal.id);
      }
    } finally {
      await database.close();
    }
  }
}
