import type { templateApplyInputSchema } from "@repo/core";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "../../lib/provider-sync/planned-workouts";
import { needsContentGrantForRow } from "../../permissions/content-access";
import type { TrainingPlanRepository } from "../../repositories";
import { materializeAppliedTrainingPlan } from "./schedulingUtils";

const plannedEventType = "planned_activity" as const;

type ApplyTemplateInput = z.infer<typeof templateApplyInputSchema>;

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

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function toDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function todayDateOnlyUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
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

export async function applyTrainingPlanTemplateUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  profileId: string;
  repository: TrainingPlanRepository;
  values: ApplyTemplateInput;
}) {
  if (input.values.template_type !== "training_plan") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only training plan templates are supported by this mutation",
    });
  }

  const { db, permissions, profileId, repository } = input;
  const activePlanLookup = await repository.getActivePlanFromFutureEvents(profileId);
  let scheduled_sessions_replaced = 0;

  if (activePlanLookup) {
    if (!input.values.replace_existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "You already have scheduled sessions from another training plan. Replace them first.",
      });
    }

    const deleteBaseFilters = [
      eq(schema.events.profile_id, profileId),
      eq(schema.events.event_type, plannedEventType),
      gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
      ne(schema.events.status, "completed"),
    ] as const;

    const removedEvents = await db
      .delete(schema.events)
      .where(
        and(
          ...deleteBaseFilters,
          activePlanLookup.scheduleBatchId
            ? sql`exists (
                select 1
                from event_schedule_links
                where event_schedule_links.event_id = events.id
                  and event_schedule_links.profile_id = ${profileId}::uuid
                  and event_schedule_links.schedule_batch_id = ${activePlanLookup.scheduleBatchId}::uuid
              )`
            : sql`exists (
                select 1
                from event_schedule_links
                where event_schedule_links.event_id = events.id
                  and event_schedule_links.profile_id = ${profileId}::uuid
                  and event_schedule_links.training_plan_id = ${activePlanLookup.trainingPlanId}::uuid
              )`,
        ),
      )
      .returning({ id: schema.events.id });

    scheduled_sessions_replaced = removedEvents.length;
    await Promise.all(removedEvents.map((event) => permissions.revokeEventGrants(event.id)));
    await enqueuePlannedWorkoutSyncForCalendarWrite({
      db,
      eventIds: removedEvents.map((event) => event.id),
      operation: "unsync",
      profileId,
    });

    if (activePlanLookup.userTrainingPlanId) {
      await db
        .update(schema.userTrainingPlans)
        .set({ status: "abandoned", updated_at: new Date() })
        .where(eq(schema.userTrainingPlans.id, activePlanLookup.userTrainingPlanId));
    }
  }

  const templatePlan = await repository.getAccessibleTrainingPlan({
    id: input.values.template_id,
    profileId,
  });

  if (!templatePlan) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Training plan template not found",
    });
  }

  const structure =
    templatePlan.structure && typeof templatePlan.structure === "object"
      ? ({ ...(templatePlan.structure as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const materializedApplication = materializeAppliedTrainingPlan({
    applicationMode: input.values.application_mode,
    startDate: input.values.start_date,
    targetDate: input.values.target_date,
    structure,
    todayDate: todayDateOnlyUtc(),
  });

  const appliedStructureId = crypto.randomUUID();
  materializedApplication.snapshotStructure.id = appliedStructureId;

  const appliedPlanId = templatePlan.id as string;
  const userTrainingPlanId = crypto.randomUUID();
  const materializedSessions = materializedApplication.materializedSessions;
  const candidatePlanIds = Array.from(
    new Set(
      materializedSessions
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
    const accessiblePlans = await db.execute(sql<{
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
          profile_id = ${profileId}::uuid
          or is_system_template = true
          or template_visibility = 'public'
          or exists (
            select 1
            from content_access_grants
            where content_access_grants.content_type = 'activity_plan'
              and content_access_grants.content_id = activity_plans.id
              and content_access_grants.grantee_profile_id = ${profileId}::uuid
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

  const unresolvedPlanIds = candidatePlanIds.filter((planId) => !allowedPlanIds.has(planId));
  if (templatePlan.is_system_template === true && unresolvedPlanIds.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This system training plan cannot be scheduled because ${
        unresolvedPlanIds.length === 1
          ? "a linked activity template is"
          : "linked activity templates are"
      } unavailable: ${unresolvedPlanIds.join(", ")}`,
    });
  }

  const eventRows = materializedSessions
    .filter((session) => session.event_type === "planned")
    .filter((session) => !session.activity_plan_id || allowedPlanIds.has(session.activity_plan_id))
    .map(
      (session) =>
        ({
          profile_id: profileId,
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
          training_plan_id: appliedPlanId,
          user_training_plan_id: userTrainingPlanId,
          payload: {
            training_plan_generation: {
              application_mode: materializedApplication.applicationMode,
              applied_start_date: materializedApplication.appliedPlanStartDate,
              source_day_offset: session.source_day_offset,
              source_path: session.source_path,
              target_date: materializedApplication.targetDate,
              user_training_plan_id: userTrainingPlanId,
            },
          },
        }) as any,
    );

  const schedule_batch_id = crypto.randomUUID();
  if (eventRows.length === 0) {
    const plannedSessionCount = materializedSessions.filter(
      (session) => session.event_type === "planned",
    ).length;

    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        plannedSessionCount === 0
          ? "This training plan does not contain any schedulable sessions."
          : materializedApplication.skippedSessions > 0
            ? "No future sessions remain in this training plan after applying the remaining schedule window."
            : "This training plan could not be scheduled because its linked activities are not available to your account.",
    });
  }

  const now = new Date();
  await db.insert(schema.userTrainingPlans).values({
    id: userTrainingPlanId,
    profile_id: profileId,
    training_plan_id: appliedPlanId,
    status: "active",
    start_date: materializedApplication.appliedPlanStartDate,
    target_date: materializedApplication.targetDate,
    snapshot_structure: materializedApplication.snapshotStructure,
    created_at: now,
    updated_at: now,
  });

  const insertedEvents = await db
    .insert(schema.events)
    .values(eventRows.map((eventRow) => ({ ...eventRow, schedule_batch_id })) as any)
    .returning({ id: schema.events.id });

  await Promise.all(
    insertedEvents.map((event, index) => {
      const eventRow = eventRows[index];
      if (!eventRow) return Promise.resolve();

      const linkedPlanAccess = eventRow.activity_plan_id
        ? allowedPlanAccessById.get(eventRow.activity_plan_id)
        : null;
      const shouldGrantLinkedPlan = linkedPlanAccess
        ? needsContentGrantForRow(linkedPlanAccess, profileId)
        : false;
      const shouldGrantTrainingPlan = needsContentGrantForRow(
        {
          ownerProfileId: templatePlan.profile_id,
          isPublic: templatePlan.template_visibility === "public",
          isSystem: templatePlan.is_system_template,
        },
        profileId,
      );

      if (!shouldGrantLinkedPlan && !linkedPlanAccess?.routeId && !shouldGrantTrainingPlan) {
        return Promise.resolve();
      }

      return permissions.grantEventContentAccess({
        actorProfileId: profileId,
        granteeProfileId: profileId,
        eventId: event.id,
        activityPlanId: eventRow.activity_plan_id,
        trainingPlanId: shouldGrantTrainingPlan ? appliedPlanId : null,
      });
    }),
  );

  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db,
    eventIds: insertedEvents
      .filter((_, index) => Boolean(eventRows[index]?.activity_plan_id))
      .map((event) => event.id),
    operation: "publish",
    profileId,
  });

  return {
    applied_plan_id: appliedPlanId,
    training_plan_id: templatePlan.id,
    user_training_plan_id: userTrainingPlanId,
    application_mode: materializedApplication.applicationMode,
    schedule_batch_id,
    scheduled_sessions_created: insertedEvents.length,
    scheduled_sessions_skipped: materializedApplication.skippedSessions,
    scheduled_sessions_replaced,
    cache_tags: ["events.list", "trainingPlans.list"],
  };
}
