import { addDaysDateOnlyUtc, formatDateOnlyUtc } from "@repo/core";
import { schema, type TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "../../lib/provider-sync/planned-workouts";
import { needsContentGrantForRow } from "../../permissions/content-access";
import type { TrainingPlanRepository } from "../../repositories";
import {
  materializeAppliedTrainingPlan,
  type TrainingPlanApplicationMode,
} from "./schedulingUtils";

const plannedEventType = "planned_activity" as const;

type ContentPermissions = {
  grantEventContentAccess(input: {
    actorProfileId: string;
    activityPlanId: string | null;
    eventId: string;
    granteeProfileId: string;
    trainingPlanId: string | null;
  }): Promise<unknown>;
  revokeEventGrants(eventId: string): Promise<unknown>;
};

type UserTrainingPlanApplication = typeof schema.userTrainingPlans.$inferSelect;

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function toDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function todayDateOnlyUtc(): string {
  return formatDateOnlyUtc(new Date());
}

function todayStartIsoUtc(): string {
  return toDayStartIso(todayDateOnlyUtc());
}

function getApplicationModeFromSnapshot(snapshot: unknown): TrainingPlanApplicationMode {
  const snapshotRecord = snapshot as { _application?: { application_mode?: unknown } } | null;

  if (snapshotRecord?._application?.application_mode === "remaining") {
    return "remaining";
  }

  return "full";
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

async function getOwnedUserTrainingPlan(input: {
  db: DrizzleDbClient;
  profileId: string;
  userTrainingPlanId: string;
}) {
  const rows = await input.db
    .select()
    .from(schema.userTrainingPlans)
    .where(
      and(
        eq(schema.userTrainingPlans.id, input.userTrainingPlanId),
        eq(schema.userTrainingPlans.profile_id, input.profileId),
      ),
    )
    .limit(1);

  return (rows[0] as UserTrainingPlanApplication | undefined) ?? null;
}

export async function updateActivePlanStatusUseCase(input: {
  db: DrizzleDbClient;
  id: string;
  permissions: ContentPermissions;
  profileId: string;
  repository: TrainingPlanRepository;
  status: "active" | "paused" | "completed" | "abandoned";
}) {
  const windowStartIso = todayStartIsoUtc();
  const activePlanLookup = await input.repository.getActivePlanFromFutureEvents(input.profileId);

  const futurePlanEvents = await input.db
    .select({ id: schema.events.id, training_plan_id: schema.eventScheduleLinks.training_plan_id })
    .from(schema.events)
    .innerJoin(schema.eventScheduleLinks, eq(schema.eventScheduleLinks.event_id, schema.events.id))
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        eq(schema.eventScheduleLinks.training_plan_id, input.id),
        gte(schema.events.starts_at, new Date(windowStartIso)),
      ),
    );

  const hasFutureEventsForPlan = futurePlanEvents.length > 0;
  if (!hasFutureEventsForPlan && (input.status === "active" || input.status === "paused")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Active training plan not found" });
  }

  if (input.status === "active" || input.status === "paused") {
    const allFuturePlanEvents = await input.db
      .select({ training_plan_id: schema.eventScheduleLinks.training_plan_id })
      .from(schema.events)
      .innerJoin(
        schema.eventScheduleLinks,
        eq(schema.eventScheduleLinks.event_id, schema.events.id),
      )
      .where(
        and(
          eq(schema.events.profile_id, input.profileId),
          eq(schema.events.event_type, plannedEventType),
          gte(schema.events.starts_at, new Date(windowStartIso)),
        ),
      )
      .limit(200);

    const hasOtherActivePlan = allFuturePlanEvents.some(
      (event) => typeof event.training_plan_id === "string" && event.training_plan_id !== input.id,
    );

    if (hasOtherActivePlan) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "You already have another active or paused training plan. Please complete or abandon it first.",
      });
    }

    return {
      id: input.id,
      training_plan_id: input.id,
      user_training_plan_id: activePlanLookup?.userTrainingPlanId ?? null,
      profile_id: input.profileId,
      status: input.status,
      scheduled_sessions_removed: 0,
    };
  }

  const deletedEvents = await input.db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        activePlanLookup?.trainingPlanId === input.id && activePlanLookup.scheduleBatchId
          ? sql`exists (
              select 1
              from event_schedule_links
              where event_schedule_links.event_id = events.id
                and event_schedule_links.profile_id = ${input.profileId}::uuid
                and event_schedule_links.schedule_batch_id = ${activePlanLookup.scheduleBatchId}::uuid
            )`
          : sql`exists (
              select 1
              from event_schedule_links
              where event_schedule_links.event_id = events.id
                and event_schedule_links.profile_id = ${input.profileId}::uuid
                and event_schedule_links.training_plan_id = ${input.id}::uuid
            )`,
        gte(schema.events.starts_at, new Date(windowStartIso)),
        ne(schema.events.status, "completed"),
      ),
    )
    .returning({ id: schema.events.id });

  await Promise.all(deletedEvents.map((event) => input.permissions.revokeEventGrants(event.id)));
  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db: input.db,
    eventIds: deletedEvents.map((event) => event.id),
    operation: "unsync",
    profileId: input.profileId,
  });

  if (activePlanLookup?.userTrainingPlanId) {
    await input.db
      .update(schema.userTrainingPlans)
      .set({ status: input.status, updated_at: new Date() })
      .where(eq(schema.userTrainingPlans.id, activePlanLookup.userTrainingPlanId));
  }

  return {
    id: input.id,
    training_plan_id: input.id,
    user_training_plan_id: activePlanLookup?.userTrainingPlanId ?? null,
    profile_id: input.profileId,
    status: input.status,
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
    id: activePlanLookup.trainingPlanId,
    profile_id: input.profileId,
    training_plan_id: activePlanLookup.trainingPlanId,
    user_training_plan_id: activePlanLookup.userTrainingPlanId,
    schedule_batch_id: activePlanLookup.scheduleBatchId,
    status: "active",
    next_event_at: activePlanLookup.nextEventAt,
    training_plan: activePlanLookup.trainingPlan as TrainingPlanRow,
  };
}
