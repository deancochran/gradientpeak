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

export async function removeAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  profileId: string;
  userTrainingPlanId: string;
}) {
  const application = await getOwnedUserTrainingPlan(input);

  if (!application) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled plan not found" });
  }

  const deletedEvents = await input.db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        sql`exists (
            select 1
            from event_schedule_links
            where event_schedule_links.event_id = events.id
              and event_schedule_links.profile_id = ${input.profileId}::uuid
              and event_schedule_links.user_training_plan_id = ${application.id}::uuid
          )`,
        gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
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
  await input.db
    .update(schema.userTrainingPlans)
    .set({ status: "abandoned", updated_at: new Date() })
    .where(eq(schema.userTrainingPlans.id, application.id));

  return {
    success: true,
    user_training_plan_id: application.id,
    scheduled_sessions_removed: deletedEvents.length,
  };
}

export async function shiftAppliedScheduleUseCase(input: {
  days: number;
  db: DrizzleDbClient;
  profileId: string;
  userTrainingPlanId: string;
}) {
  const application = await getOwnedUserTrainingPlan(input);

  if (!application) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled plan not found" });
  }

  const futureEvents = await input.db
    .select({
      id: schema.events.id,
      activity_plan_id: schema.eventScheduleLinks.activity_plan_id,
      starts_at: schema.events.starts_at,
      ends_at: schema.events.ends_at,
    })
    .from(schema.events)
    .innerJoin(schema.eventScheduleLinks, eq(schema.eventScheduleLinks.event_id, schema.events.id))
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        eq(schema.eventScheduleLinks.user_training_plan_id, application.id),
        gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
        ne(schema.events.status, "completed"),
      ),
    )
    .orderBy(asc(schema.events.starts_at));

  if (futureEvents.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No future scheduled sessions found" });
  }

  for (const event of futureEvents) {
    const currentScheduledDate = formatDateOnlyUtc(event.starts_at);
    const nextScheduledDate = addDaysDateOnlyUtc(currentScheduledDate, input.days);
    await input.db
      .update(schema.events)
      .set({
        starts_at: new Date(toDayStartIso(nextScheduledDate)),
        ends_at: new Date(toDayStartIso(addDaysDateOnlyUtc(nextScheduledDate, 1))),
        status: "scheduled",
        updated_at: new Date(),
      })
      .where(eq(schema.events.id, event.id));
  }

  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db: input.db,
    eventIds: futureEvents
      .filter((event) => Boolean(event.activity_plan_id))
      .map((event) => event.id),
    operation: "publish",
    profileId: input.profileId,
  });

  await input.db
    .update(schema.userTrainingPlans)
    .set({
      start_date: addDaysDateOnlyUtc(application.start_date, input.days),
      target_date: application.target_date
        ? addDaysDateOnlyUtc(application.target_date, input.days)
        : null,
      updated_at: new Date(),
    })
    .where(eq(schema.userTrainingPlans.id, application.id));

  return {
    success: true,
    days_shifted: input.days,
    affected_count: futureEvents.length,
    user_training_plan_id: application.id,
  };
}

export async function regenerateAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  profileId: string;
  repository: TrainingPlanRepository;
  userTrainingPlanId: string;
}) {
  const application = await getOwnedUserTrainingPlan(input);

  if (!application) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled plan not found" });
  }

  const trainingPlan = await input.repository.getAccessibleTrainingPlan({
    id: application.training_plan_id,
    profileId: input.profileId,
  });

  if (!trainingPlan) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Training plan not found" });
  }

  const snapshotStructure =
    application.snapshot_structure && typeof application.snapshot_structure === "object"
      ? ({ ...(application.snapshot_structure as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : trainingPlan.structure && typeof trainingPlan.structure === "object"
        ? ({ ...(trainingPlan.structure as Record<string, unknown>) } as Record<string, unknown>)
        : {};
  const applicationMode = getApplicationModeFromSnapshot(snapshotStructure);
  const snapshotApplication =
    snapshotStructure._application && typeof snapshotStructure._application === "object"
      ? (snapshotStructure._application as Record<string, unknown>)
      : null;
  const targetDate =
    typeof snapshotApplication?.target_date === "string"
      ? snapshotApplication.target_date
      : undefined;
  const resolved = materializeAppliedTrainingPlan({
    applicationMode,
    startDate: application.start_date,
    targetDate,
    structure: snapshotStructure,
    todayDate: todayDateOnlyUtc(),
  });

  const removedEvents = await input.db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, plannedEventType),
        sql`exists (
            select 1
            from event_schedule_links
            where event_schedule_links.event_id = events.id
              and event_schedule_links.profile_id = ${input.profileId}::uuid
              and event_schedule_links.user_training_plan_id = ${application.id}::uuid
          )`,
        gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
        ne(schema.events.status, "completed"),
      ),
    )
    .returning({ id: schema.events.id });

  await Promise.all(removedEvents.map((event) => input.permissions.revokeEventGrants(event.id)));
  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db: input.db,
    eventIds: removedEvents.map((event) => event.id),
    operation: "unsync",
    profileId: input.profileId,
  });

  const candidatePlanIds = Array.from(
    new Set(
      resolved.materializedSessions
        .map((session) => session.activity_plan_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  let allowedPlanIds = new Set<string>();
  const allowedPlanNameById = new Map<string, string>();
  const allowedPlanAccessById = new Map<
    string,
    {
      ownerProfileId?: string | null;
      isPublic?: boolean | null;
      isSystem?: boolean | null;
      routeId?: string | null;
    }
  >();

  if (candidatePlanIds.length > 0) {
    const accessiblePlans = await input.db.execute(sql<{
      id: string;
      name: string;
      ownerProfileId: string | null;
      isPublic: boolean | null;
      isSystem: boolean | null;
      routeId: string | null;
    }>`
      select
        id,
        name,
        profile_id as "ownerProfileId",
        template_visibility = 'public' as "isPublic",
        is_system_template as "isSystem",
        route_id as "routeId"
      from activity_plans
      where id in (${sql.join(
        candidatePlanIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        and (
          profile_id = ${input.profileId}::uuid
          or is_system_template = true
          or template_visibility = 'public'
          or exists (
            select 1
            from content_access_grants
            where content_access_grants.content_type = 'activity_plan'
              and content_access_grants.content_id = activity_plans.id
              and content_access_grants.grantee_profile_id = ${input.profileId}::uuid
              and content_access_grants.access_level = 'read'
              and content_access_grants.revoked_at is null
              and (content_access_grants.expires_at is null or content_access_grants.expires_at > now())
          )
        )
    `);

    const accessiblePlanRows = getSqlRows<{
      id: string;
      name: string;
      ownerProfileId?: string | null;
      isPublic?: boolean | null;
      isSystem?: boolean | null;
      routeId?: string | null;
    }>(accessiblePlans);
    allowedPlanIds = new Set(accessiblePlanRows.map((row) => row.id));
    accessiblePlanRows.forEach((row) => {
      allowedPlanNameById.set(row.id, row.name);
      allowedPlanAccessById.set(row.id, {
        ownerProfileId: row.ownerProfileId,
        isPublic: row.isPublic,
        isSystem: row.isSystem,
        routeId: row.routeId,
      });
    });
  }

  const eventRows = resolved.materializedSessions
    .filter((session) => !session.activity_plan_id || allowedPlanIds.has(session.activity_plan_id))
    .map((session) => ({
      profile_id: input.profileId,
      event_type: plannedEventType,
      title:
        session.event_title_override ??
        (session.activity_plan_id
          ? allowedPlanNameById.get(session.activity_plan_id)
          : undefined) ??
        session.title,
      all_day: session.all_day,
      timezone: "UTC",
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      status: "scheduled" as const,
      activity_plan_id: session.activity_plan_id,
      training_plan_id: trainingPlan.id,
      user_training_plan_id: application.id,
      payload: {
        training_plan_generation: {
          application_mode: resolved.applicationMode,
          applied_start_date: resolved.appliedPlanStartDate,
          source_day_offset: session.source_day_offset,
          source_path: session.source_path,
          target_date: resolved.targetDate,
          user_training_plan_id: application.id,
        },
      },
    }));

  if (eventRows.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This scheduled plan no longer has any future sessions to regenerate.",
    });
  }

  const schedule_batch_id = crypto.randomUUID();
  const insertedEvents = await input.db
    .insert(schema.events)
    .values(eventRows.map((row) => ({ ...row, schedule_batch_id })) as any)
    .returning({ id: schema.events.id });

  await Promise.all(
    insertedEvents.map((event, index) => {
      const eventRow = eventRows[index];
      if (!eventRow) {
        return Promise.resolve();
      }

      const linkedPlanAccess = eventRow.activity_plan_id
        ? allowedPlanAccessById.get(eventRow.activity_plan_id)
        : null;
      const shouldGrantLinkedPlan = linkedPlanAccess
        ? needsContentGrantForRow(linkedPlanAccess, input.profileId)
        : false;
      const shouldGrantTrainingPlan = needsContentGrantForRow(
        {
          ownerProfileId: trainingPlan.profile_id,
          isPublic: trainingPlan.template_visibility === "public",
          isSystem: trainingPlan.is_system_template,
        },
        input.profileId,
      );

      if (!shouldGrantLinkedPlan && !linkedPlanAccess?.routeId && !shouldGrantTrainingPlan) {
        return Promise.resolve();
      }

      return input.permissions.grantEventContentAccess({
        actorProfileId: input.profileId,
        granteeProfileId: input.profileId,
        eventId: event.id,
        activityPlanId: eventRow.activity_plan_id,
        trainingPlanId: shouldGrantTrainingPlan ? trainingPlan.id : null,
      });
    }),
  );

  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db: input.db,
    eventIds: insertedEvents
      .filter((_, index) => Boolean(eventRows[index]?.activity_plan_id))
      .map((event) => event.id),
    operation: "publish",
    profileId: input.profileId,
  });

  await input.db
    .update(schema.userTrainingPlans)
    .set({
      start_date: resolved.appliedPlanStartDate,
      target_date: resolved.targetDate,
      snapshot_structure: resolved.snapshotStructure,
      status: "active",
      updated_at: new Date(),
    })
    .where(eq(schema.userTrainingPlans.id, application.id));

  return {
    success: true,
    schedule_batch_id,
    scheduled_sessions_created: insertedEvents.length,
    scheduled_sessions_replaced: removedEvents.length,
    scheduled_sessions_skipped: resolved.skippedSessions,
    user_training_plan_id: application.id,
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
