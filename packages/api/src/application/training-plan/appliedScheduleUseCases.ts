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
import { logger } from "../../lib/logger";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "../../lib/provider-sync/planned-workouts";
import { drainDueWahooPlannedWorkoutJobs } from "../../lib/provider-sync/wahoo-planned-workout-drain";
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

async function enqueuePlannedWorkoutSyncForCalendarWrite(input: {
  db: DrizzleDbClient;
  drainDueJobs?: boolean;
  eventIds: string[];
  operation: "publish" | "unsync";
  profileId: string;
  transaction?: DrizzleTransactionClient;
}) {
  return enqueuePlannedWorkoutSyncAfterCalendarMutation(input);
}

export async function removeAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  permissionsFactory?: (db: DrizzleTransactionClient) => ContentPermissions;
  profileId: string;
  scheduleBatchId: string;
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
    const queueResult = await enqueuePlannedWorkoutSyncForCalendarWrite({
      db: input.db,
      drainDueJobs: false,
      eventIds: candidates.map((event) => event.id),
      operation: "unsync",
      profileId: input.profileId,
      transaction: tx,
    });
    if (queueResult && !queueResult.success) {
      throw new Error("Failed to enqueue planned workout unsync jobs");
    }
    await tx.delete(schema.events).where(
      inArray(
        schema.events.id,
        candidates.map((event) => event.id),
      ),
    );
    return candidates;
  });

  const result = {
    success: true,
    schedule_batch_id: input.scheduleBatchId,
    scheduled_sessions_removed: deletedEvents.length,
  };
  try {
    await drainDueWahooPlannedWorkoutJobs({
      db: input.db,
      limit: 3,
      workerId: "remove-applied-schedule-planned-workout-drain",
    });
  } catch {
    logger.error("Failed to drain planned workout unsync jobs after schedule removal", {
      category: "upstream",
      provider: "wahoo",
    });
  }
  return result;
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
