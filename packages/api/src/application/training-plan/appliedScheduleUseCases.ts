import {
  formatDateOnlyInTimeZone,
  ianaTimezoneSchema,
  scheduledDateTimeToIsoInstant,
} from "@repo/core";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, ne } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "../../lib/provider-sync/planned-activities";
import type { TrainingPlanRepository } from "../../repositories";

const plannedEventType = "planned" as const;

type ContentPermissions = {
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

export async function removeAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  permissionsFactory?: (db: DrizzleTransactionClient) => ContentPermissions;
  profileId: string;
  scheduleBatchId: string;
  trainingPlanId: string;
}) {
  const [profile] = await input.db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, input.profileId))
    .limit(1);
  const planningTimezone = getRequiredPlanningTimezone(profile?.planningTimezone);
  const todayStart = scheduledDateTimeToIsoInstant({
    scheduledDate: formatDateOnlyInTimeZone(new Date(), planningTimezone),
    time: "00:00",
    timeZone: planningTimezone,
  });
  const deletedEvents = await input.db.transaction(async (tx) => {
    const candidateQuery = tx
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.profile_id, input.profileId),
          eq(schema.events.event_type, plannedEventType),
          eq(schema.events.training_plan_id, input.trainingPlanId),
          eq(schema.events.schedule_batch_id, input.scheduleBatchId),
          gte(schema.events.starts_at, new Date(todayStart)),
          ne(schema.events.status, "completed"),
        ),
      );
    const lockableQuery = candidateQuery as typeof candidateQuery & {
      for?: (strength: "update") => typeof candidateQuery;
    };
    const candidates = await (lockableQuery.for ? lockableQuery.for("update") : candidateQuery);
    if (candidates.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No future scheduled sessions found" });
    }

    const permissions = input.permissionsFactory?.(tx) ?? input.permissions;
    await Promise.all(candidates.map((event) => permissions.revokeEventGrants(event.id)));
    const queueResult = await enqueuePlannedActivitySyncForCalendarWrite({
      db: input.db,
      eventIds: candidates.map((event) => event.id),
      operation: "unsync",
      profileId: input.profileId,
      transaction: tx,
    });
    if (queueResult && !queueResult.success) {
      throw new Error("Failed to enqueue planned activity unsync jobs");
    }
    await tx.delete(schema.events).where(
      inArray(
        schema.events.id,
        candidates.map((event) => event.id),
      ),
    );
    return candidates;
  });

  return {
    success: true,
    schedule_batch_id: input.scheduleBatchId,
    training_plan_id: input.trainingPlanId,
    scheduled_sessions_removed: deletedEvents.length,
  };
}

export async function getActivePlanUseCase(input: {
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  const activePlanLookup = await input.repository.getActivePlanFromFutureEvents(input.profileId);

  if (!activePlanLookup) {
    return null;
  }

  return {
    ...activePlanLookup.trainingPlan,
    next_event_at: activePlanLookup.nextEventAt,
    schedule_batch_id: activePlanLookup.scheduleBatchId,
  };
}
