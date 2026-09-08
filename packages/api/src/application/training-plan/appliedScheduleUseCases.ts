import { formatDateOnlyInTimeZone, ianaTimezoneSchema } from "@repo/core";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "../../lib/provider-sync/planned-activities";
import type { PlannedSessionRepositoryPort } from "../../repositories";
import { cancelPlannedSession } from "../calendar/cancel-planned-session";

const plannedEventType = "planned" as const;

export type AppliedScheduleContentPermissions = {
  revokeEventGrants(eventId: string): Promise<unknown>;
};

function getRequiredPlanningTimezone(value: string | null | undefined): string {
  const parsed = ianaTimezoneSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "A valid planning timezone is required to manage a training schedule.",
  });
}

async function enqueuePlannedActivitySyncForCalendarWrite(input: {
  db: DrizzleDbClient;
  eventIds: string[];
  operation: "publish" | "unsync";
  profileId: string;
  transaction?: DrizzleTransactionClient;
}) {
  return enqueueWahooPlannedActivitySyncAfterCalendarMutation(input);
}

export async function getCurrentAthletePlanningDate(input: {
  db: DrizzleDbClient;
  profileId: string;
}) {
  const [profile] = await input.db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, input.profileId))
    .limit(1);
  const planningTimezone = getRequiredPlanningTimezone(profile?.planningTimezone);
  return formatDateOnlyInTimeZone(new Date(), planningTimezone);
}

export async function getAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  trainingPlanId: string;
}) {
  const todayDate = await getCurrentAthletePlanningDate(input);
  const [schedule] = await input.db
    .select({
      scheduleBatchId: schema.events.schedule_batch_id,
      startsAt: schema.events.starts_at,
      trainingPlanId: schema.events.training_plan_id,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        eq(schema.events.training_plan_id, input.trainingPlanId),
        isNotNull(schema.events.schedule_batch_id),
        gte(schema.events.scheduled_date, todayDate),
        eq(schema.events.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.events.scheduled_date), asc(schema.events.starts_at), asc(schema.events.id))
    .limit(1);

  if (!schedule?.scheduleBatchId || schedule.trainingPlanId !== input.trainingPlanId) {
    return null;
  }

  return {
    schedule_batch_id: schedule.scheduleBatchId,
    starts_at: schedule.startsAt.toISOString(),
    training_plan_id: schedule.trainingPlanId,
  };
}

export async function removeEligibleAppliedScheduleEvents(input: {
  db: DrizzleDbClient;
  permissions: AppliedScheduleContentPermissions;
  profileId: string;
  scheduleBatchId?: string;
  todayDate: string;
  trainingPlanId: string;
  transaction: DrizzleTransactionClient;
}) {
  const conditions = [
    eq(schema.events.profile_id, input.profileId),
    eq(schema.events.event_type, plannedEventType),
    eq(schema.events.training_plan_id, input.trainingPlanId),
    gte(schema.events.scheduled_date, input.todayDate),
    ne(schema.events.status, "completed"),
    isNull(schema.events.linked_activity_id),
  ];
  if (input.scheduleBatchId) {
    conditions.push(eq(schema.events.schedule_batch_id, input.scheduleBatchId));
  }

  const candidateQuery = input.transaction
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(...conditions));
  const lockableQuery = candidateQuery as typeof candidateQuery & {
    for?: (strength: "update") => typeof candidateQuery;
  };
  const candidates = await (lockableQuery.for ? lockableQuery.for("update") : candidateQuery);
  if (candidates.length === 0) return [];

  await Promise.all(candidates.map((event) => input.permissions.revokeEventGrants(event.id)));
  const queueResult = await enqueuePlannedActivitySyncForCalendarWrite({
    db: input.db,
    eventIds: candidates.map((event) => event.id),
    operation: "unsync",
    profileId: input.profileId,
    transaction: input.transaction,
  });
  if (queueResult && !queueResult.success) {
    throw new Error("Failed to enqueue planned activity unsync jobs");
  }
  await input.transaction.delete(schema.events).where(
    inArray(
      schema.events.id,
      candidates.map((event) => event.id),
    ),
  );
  return candidates;
}

export async function removeAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  permissions: AppliedScheduleContentPermissions;
  permissionsFactory?: (db: DrizzleTransactionClient) => AppliedScheduleContentPermissions;
  plannedSessionRepositoryFactory?: (db: DrizzleTransactionClient) => PlannedSessionRepositoryPort;
  profileId: string;
  scheduleBatchId: string;
  trainingPlanId: string;
}) {
  const todayDate = await getCurrentAthletePlanningDate(input);
  const deletedEvents = await input.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.profileId}, 0))`);
    const candidates = await removeEligibleAppliedScheduleEvents({
      db: input.db,
      permissions: input.permissionsFactory?.(tx) ?? input.permissions,
      profileId: input.profileId,
      scheduleBatchId: input.scheduleBatchId,
      todayDate,
      trainingPlanId: input.trainingPlanId,
      transaction: tx,
    });
    if (candidates.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No future scheduled sessions found" });
    }

    const plannedSessionQuery = tx
      .select({
        id: schema.plannedSessions.id,
        sessionRevision: schema.plannedSessions.session_revision,
      })
      .from(schema.plannedSessions)
      .where(
        and(
          eq(schema.plannedSessions.profile_id, input.profileId),
          eq(schema.plannedSessions.training_plan_id, input.trainingPlanId),
          gte(schema.plannedSessions.planning_date, todayDate),
          eq(schema.plannedSessions.status, "scheduled"),
        ),
      )
      .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id));
    const lockablePlannedSessionQuery = plannedSessionQuery as typeof plannedSessionQuery & {
      for?: (strength: "update") => typeof plannedSessionQuery;
    };
    const plannedSessions = await (lockablePlannedSessionQuery.for
      ? lockablePlannedSessionQuery.for("update")
      : plannedSessionQuery);
    const plannedSessionRepository = input.plannedSessionRepositoryFactory
      ? input.plannedSessionRepositoryFactory(tx)
      : createDrizzlePlannedSessionRepository(tx);
    const cancelledAt = new Date().toISOString();
    for (const session of plannedSessions) {
      await cancelPlannedSession({
        repository: plannedSessionRepository,
        profileId: input.profileId,
        sessionId: session.id,
        expectedRevision: session.sessionRevision,
        reason: "user_requested",
        cancelledAt,
      });
    }
    return candidates;
  });

  return {
    success: true,
    schedule_batch_id: input.scheduleBatchId,
    training_plan_id: input.trainingPlanId,
    scheduled_sessions_removed: deletedEvents.length,
  };
}
