import type { templateApplyInputSchema } from "@repo/core";
import { type EventInsert, schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "../../lib/provider-sync/planned-workouts";
import { drainDueWahooPlannedWorkoutJobs } from "../../lib/provider-sync/wahoo-planned-workout-drain";
import { needsContentGrantForRow } from "../../permissions/content-access";
import type { TrainingPlanRepository } from "../../repositories";
import { materializeAppliedTrainingPlan } from "./schedulingUtils";

const plannedEventType = "planned" as const;

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

type InsertedEventIdentity = { id: string };
type PlannedEventInsertRow = Pick<
  EventInsert,
  | "activity_plan_id"
  | "all_day"
  | "description"
  | "ends_at"
  | "event_type"
  | "payload"
  | "profile_id"
  | "scheduled_date"
  | "starts_at"
  | "status"
  | "timezone"
  | "title"
  | "training_plan_id"
>;

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

export async function applyTrainingPlanTemplateUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  permissionsFactory?: (db: DrizzleDbClient) => ContentPermissions;
  profileId: string;
  repository: TrainingPlanRepository;
  repositoryFactory?: (db: DrizzleDbClient) => TrainingPlanRepository;
  values: ApplyTemplateInput;
}) {
  if (input.values.template_type !== "training_plan") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only training plan templates are supported by this mutation",
    });
  }

  const { db, profileId, repository } = input;
  const [profile] = await db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .limit(1);
  // Existing profiles created before planning_timezone remain explicitly on the UTC legacy path.
  const planningTimezone = profile?.planningTimezone ?? "UTC";
  const preliminaryActivePlanLookup = await repository.getActivePlanFromFutureEvents(profileId);
  if (preliminaryActivePlanLookup && !input.values.replace_existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "You already have scheduled sessions from another training plan. Replace them first.",
    });
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
    planningTimezone,
    startDate: input.values.start_date,
    targetDate: input.values.target_date,
    structure,
    todayDate: todayDateOnlyUtc(),
  });

  const appliedPlanId = templatePlan.id as string;
  const materializedSessions = materializedApplication.materializedSessions;
  const unlinkedSessions = materializedSessions.filter(
    (session) => session.event_type === "planned" && !session.activity_plan_id,
  );
  if (unlinkedSessions.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This training plan cannot be scheduled because ${unlinkedSessions.length} planned ${
        unlinkedSessions.length === 1 ? "session has" : "sessions have"
      } no valid linked activity plan.`,
    });
  }
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
  if (unresolvedPlanIds.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This training plan cannot be scheduled because ${
        unresolvedPlanIds.length === 1
          ? "a linked activity template is"
          : "linked activity templates are"
      } unavailable: ${unresolvedPlanIds.join(", ")}`,
    });
  }

  const eventRows: PlannedEventInsertRow[] = materializedSessions
    .filter((session) => session.event_type === "planned")
    .map((session) => ({
      profile_id: profileId,
      event_type: plannedEventType,
      title:
        session.event_title_override ??
        (session.activity_plan_id
          ? allowedPlanNameById.get(session.activity_plan_id)
          : undefined) ??
        session.title,
      description: session.description,
      all_day: session.all_day,
      timezone: session.timezone,
      starts_at: new Date(session.starts_at),
      ends_at: session.ends_at ? new Date(session.ends_at) : null,
      scheduled_date: session.scheduled_date,
      status: "scheduled" as const,
      activity_plan_id: session.activity_plan_id,
      training_plan_id: appliedPlanId,
      payload: {
        training_plan_generation: {
          application_mode: materializedApplication.applicationMode,
          applied_start_date: materializedApplication.appliedPlanStartDate,
          source_day_offset: session.source_day_offset,
          source_path: session.source_path,
          target_date: materializedApplication.targetDate,
        },
      },
    }));

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

  const { insertedEvents, removedEvents, shouldDrainProviderJobs } = await db.transaction(
    async (
      tx,
    ): Promise<{
      insertedEvents: InsertedEventIdentity[];
      removedEvents: InsertedEventIdentity[];
      shouldDrainProviderJobs: boolean;
    }> => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
      // The transaction exposes Drizzle's query/write surface but omits the root
      // client's handle. Supplying that handle keeps downstream repository
      // factories on the transaction while satisfying the shared client type.
      const transactionDb: DrizzleDbClient = Object.assign(tx, { $client: db.$client });
      const transactionRepository = input.repositoryFactory?.(transactionDb) ?? repository;
      const activePlanLookup = await transactionRepository.getActivePlanFromFutureEvents(profileId);
      if (activePlanLookup && !input.values.replace_existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "You already have scheduled sessions from another training plan. Replace them first.",
        });
      }

      const removedEvents = activePlanLookup
        ? await tx
            .delete(schema.events)
            .where(
              and(
                eq(schema.events.profile_id, profileId),
                eq(schema.events.event_type, plannedEventType),
                gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
                ne(schema.events.status, "completed"),
                activePlanLookup.scheduleBatchId
                  ? eq(schema.events.schedule_batch_id, activePlanLookup.scheduleBatchId)
                  : eq(schema.events.training_plan_id, activePlanLookup.trainingPlanId),
              ),
            )
            .returning({ id: schema.events.id })
        : [];

      const eventInsertRows: EventInsert[] = eventRows.map((eventRow) => ({
        ...eventRow,
        id: crypto.randomUUID(),
        schedule_batch_id,
      }));
      const insertedEvents = await tx
        .insert(schema.events)
        .values(eventInsertRows)
        .returning({ id: schema.events.id });

      if (insertedEvents.length !== eventRows.length) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create the full scheduled training plan event set.",
        });
      }

      const permissions = input.permissionsFactory?.(transactionDb) ?? input.permissions;
      for (const event of removedEvents) {
        await permissions.revokeEventGrants(event.id);
      }
      const unsyncResult = await enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: transactionDb,
        drainDueJobs: false,
        eventIds: removedEvents.map((event) => event.id),
        operation: "unsync",
        profileId,
      });
      if (unsyncResult && !unsyncResult.success) {
        throw new Error("Failed to queue provider unsync for the replaced training plan schedule.");
      }

      for (const [index, event] of insertedEvents.entries()) {
        const eventRow = eventRows[index];
        if (!eventRow) continue;

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
          continue;
        }

        await permissions.grantEventContentAccess({
          actorProfileId: profileId,
          granteeProfileId: profileId,
          eventId: event.id,
          activityPlanId: eventRow.activity_plan_id ?? null,
          trainingPlanId: shouldGrantTrainingPlan ? appliedPlanId : null,
        });
      }

      const publishResult = await enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: transactionDb,
        drainDueJobs: false,
        eventIds: insertedEvents
          .filter((_, index) => Boolean(eventRows[index]?.activity_plan_id))
          .map((event) => event.id),
        operation: "publish",
        profileId,
      });
      if (publishResult && !publishResult.success) {
        throw new Error("Failed to queue provider publication for the training plan schedule.");
      }

      return {
        insertedEvents,
        removedEvents,
        shouldDrainProviderJobs: Boolean(unsyncResult?.queued || publishResult?.queued),
      };
    },
  );

  if (shouldDrainProviderJobs) {
    try {
      await drainDueWahooPlannedWorkoutJobs({
        db,
        limit: 3,
        workerId: "training-plan-application-planned-workout-drain",
      });
    } catch (error) {
      logger.error("Failed to drain queued provider jobs after training plan application", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    applied_plan_id: appliedPlanId,
    training_plan_id: templatePlan.id,
    application_mode: materializedApplication.applicationMode,
    schedule_batch_id,
    scheduled_sessions_created: insertedEvents.length,
    scheduled_sessions_skipped: materializedApplication.skippedSessions,
    scheduled_sessions_replaced: removedEvents.length,
    cache_tags: ["events.list", "trainingPlans.list"],
  };
}
