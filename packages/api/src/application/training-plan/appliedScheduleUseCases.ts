import { formatDateOnlyUtc } from "@repo/core";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, ne } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "../../lib/provider-sync/planned-workouts";
import type { TrainingPlanRepository } from "../../repositories";

const plannedEventType = "planned" as const;

type ContentPermissions = {
  revokeEventGrants(eventId: string): Promise<unknown>;
};

function toDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function todayDateOnlyUtc(): string {
  return formatDateOnlyUtc(new Date());
}

function todayStartIsoUtc(): string {
  return toDayStartIso(todayDateOnlyUtc());
}

async function enqueuePlannedWorkoutSyncForCalendarWrite(input: {
  db: DrizzleDbClient;
  eventIds: string[];
  operation: "publish" | "unsync";
  profileId: string;
}) {
  try {
    await enqueuePlannedWorkoutSyncAfterCalendarMutation(input);
  } catch (error) {
    logger.error("Failed to enqueue planned workout sync after calendar write", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function removeAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  profileId: string;
  scheduleBatchId: string;
}) {
  const deletedEvents = await input.db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        eq(schema.events.schedule_batch_id, input.scheduleBatchId),
        gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
        ne(schema.events.status, "completed"),
      ),
    )
    .returning({ id: schema.events.id });

  if (deletedEvents.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No future scheduled sessions found" });
  }

  await Promise.all(deletedEvents.map((event) => input.permissions.revokeEventGrants(event.id)));
  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db: input.db,
    eventIds: deletedEvents.map((event) => event.id),
    operation: "unsync",
    profileId: input.profileId,
  });

  return {
    success: true,
    schedule_batch_id: input.scheduleBatchId,
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
