import { formatDateOnlyInTimeZone, ianaTimezoneSchema } from "@repo/core";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "../../lib/provider-sync/planned-activities";

const plannedEventType = "planned" as const;

export type AppliedScheduleContentPermissions = {
  revokeEventGrants(eventId: string): Promise<unknown>;
};

function getRequiredPlanningTimezone(value: string | null | undefined): string {
  const parsed = ianaTimezoneSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "A valid planning timezone is required before removing a training schedule.",
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
  profileId: string;
  scheduleBatchId: string;
  trainingPlanId: string;
}) {
  const todayDate = await getCurrentAthletePlanningDate(input);
  const deletedEvents = await input.db.transaction(async (tx) => {
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
    return candidates;
  });

  return {
    success: true,
    schedule_batch_id: input.scheduleBatchId,
    training_plan_id: input.trainingPlanId,
    scheduled_sessions_removed: deletedEvents.length,
  };
}
