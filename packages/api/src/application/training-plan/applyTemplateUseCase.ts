import {
  activityPlanStructureSchema,
  addDaysDateOnlyUtc,
  formatDateOnlyInTimeZone,
  ianaTimezoneSchema,
  persistedTrainingPlanStructureSchema,
  scheduledDateTimeToIsoInstant,
  type templateApplyInputSchema,
} from "@repo/core";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { type EventInsert, schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { PLANNED_SESSION_CACHE_TAGS } from "../../contracts/cache-receipts";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "../../lib/provider-sync/planned-activities";
import { needsContentGrantForRow } from "../../permissions/content-access";
import type { PlannedSessionRepositoryPort, TrainingPlanRepository } from "../../repositories";
import { readPublishedAthleteStateSnapshotData } from "../../repositories/athlete-state-repository";
import { cancelPlannedSession } from "../calendar/cancel-planned-session";
import { createPlannedSession } from "../calendar/create-planned-session";
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
  | "original_starts_at"
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

function getRequiredPlanningTimezone(value: string | null | undefined): string {
  const parsed = ianaTimezoneSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "A valid planning timezone is required before applying a training plan.",
  });
}

export async function applyTrainingPlanTemplateUseCase(input: {
  db: DrizzleDbClient;
  permissions: ContentPermissions;
  permissionsFactory?: (db: DrizzleDbClient) => ContentPermissions;
  profileId: string;
  repository: TrainingPlanRepository;
  repositoryFactory?: (db: DrizzleDbClient) => TrainingPlanRepository;
  plannedSessionRepositoryFactory?: (db: DrizzleDbClient) => PlannedSessionRepositoryPort;
  basePublishedRevision?: number;
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
  const planningTimezone = getRequiredPlanningTimezone(profile?.planningTimezone);
  const todayDate = formatDateOnlyInTimeZone(new Date(), planningTimezone);
  const todayStart = scheduledDateTimeToIsoInstant({
    scheduledDate: todayDate,
    time: "00:00",
    timeZone: planningTimezone,
  });
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
  if (templatePlan.profile_id !== profileId && !templatePlan.is_system_template) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Training plan template not found",
    });
  }

  const parsedStructure = persistedTrainingPlanStructureSchema.safeParse(templatePlan.structure);
  if (!parsedStructure.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This training plan cannot be scheduled because its structure is not canonical version 1.",
      cause: parsedStructure.error,
    });
  }
  const structure = parsedStructure.data;

  const materializedApplication = materializeAppliedTrainingPlan({
    applicationMode: input.values.application_mode,
    planningTimezone,
    startDate: input.values.start_date,
    targetDate: input.values.target_date,
    structure,
    todayDate,
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
  const allowedPlanSnapshotById = new Map<
    string,
    { structure: unknown; updatedAt: Date | string }
  >();
  const allowedPlanAccessById = new Map<
    string,
    {
      ownerProfileId?: string | null;
      isPublic?: boolean | null;
      isSystem?: boolean | null;
    }
  >();

  if (candidatePlanIds.length > 0) {
    const accessiblePlans = await db.execute(sql<{
      id: string;
      name: string;
      ownerProfileId: string | null;
      isPublic: boolean | null;
      isSystem: boolean | null;
      structure: unknown;
      updatedAt: Date | string;
    }>`
      select
        id,
        name,
        profile_id as "ownerProfileId",
        content_visibility = 'public' as "isPublic",
        is_system_template as "isSystem",
        structure,
        updated_at as "updatedAt"
      from activity_plans
      where id in (${sql.join(
        candidatePlanIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        and (
          profile_id = ${profileId}::uuid
          or is_system_template = true
        )
    `);

    const accessiblePlanRows = getSqlRows<{
      id: string;
      name: string;
      ownerProfileId?: string | null;
      isPublic?: boolean | null;
      isSystem?: boolean | null;
      structure: unknown;
      updatedAt: Date | string;
    }>(accessiblePlans);
    allowedPlanIds = new Set(
      accessiblePlanRows
        .filter((row) => activityPlanStructureSchema.safeParse(row.structure).success)
        .map((row) => row.id),
    );
    accessiblePlanRows.forEach((row) => {
      allowedPlanNameById.set(row.id, row.name);
      allowedPlanSnapshotById.set(row.id, {
        structure: activityPlanStructureSchema.parse(row.structure),
        updatedAt: row.updatedAt,
      });
      allowedPlanAccessById.set(row.id, {
        ownerProfileId: row.ownerProfileId,
        isPublic: row.isPublic,
        isSystem: row.isSystem,
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
    .map((session) => {
      const startsAt = new Date(session.starts_at);
      return {
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
        starts_at: startsAt,
        original_starts_at: startsAt,
        ends_at: session.ends_at ? new Date(session.ends_at) : null,
        scheduled_date: session.scheduled_date,
        status: "scheduled" as const,
        activity_plan_id: session.activity_plan_id,
        training_plan_id: appliedPlanId,
      };
    });

  const plannedSessionInputs = materializedSessions.map((session) => {
    const activityPlanId = session.activity_plan_id;
    const snapshot = activityPlanId ? allowedPlanSnapshotById.get(activityPlanId) : undefined;
    if (!activityPlanId || !snapshot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A training-plan session has no owned prescription snapshot.",
      });
    }
    const source = {
      kind: "training_plan" as const,
      trainingPlanId: appliedPlanId,
      trainingPlanRevision: templatePlan.revision,
      sourceSessionKey: `${materializedApplication.appliedPlanStartDate}:${session.source_path}`,
    };
    return plannedSessionSchema.parse({
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: crypto.randomUUID(),
      profileId,
      sessionRevision: 1,
      planningDate: session.scheduled_date,
      originalTargetDate: session.scheduled_date,
      source,
      idempotencyKey: plannedSessionIdempotencyKey(source),
      groupEventId: null,
      prescription: {
        activityPlanId,
        activityPlanRevision: 1,
        structure: snapshot.structure,
        prescriptionQuantification: null,
        capturedAt: new Date(snapshot.updatedAt).toISOString(),
      },
      lifecycle: { status: "scheduled" },
    });
  });

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

  const { insertedEvents, removedEvents, createdPlannedSessions, replayedPlannedSessions } =
    await db.transaction(
      async (
        tx,
      ): Promise<{
        insertedEvents: InsertedEventIdentity[];
        removedEvents: InsertedEventIdentity[];
        createdPlannedSessions: number;
        replayedPlannedSessions: number;
      }> => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
        if (input.basePublishedRevision !== undefined) {
          const snapshot = await readPublishedAthleteStateSnapshotData(tx, {
            profileId,
            lockStateForUpdate: true,
          });
          const state = snapshot?.current?.state;
          if (
            !state ||
            snapshot.blockingImport !== null ||
            state.dirty_from_at !== null ||
            state.source_revision !== input.basePublishedRevision ||
            state.published_revision !== input.basePublishedRevision
          ) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Athlete state changed after this training-plan application was prepared.",
            });
          }
        }
        // The transaction exposes Drizzle's query/write surface but omits the root
        // client's handle. Supplying that handle keeps downstream repository
        // factories on the transaction while satisfying the shared client type.
        const transactionDb: DrizzleDbClient = Object.assign(tx, { $client: db.$client });
        const transactionRepository = input.repositoryFactory?.(transactionDb) ?? repository;
        const plannedSessionRepository = input.plannedSessionRepositoryFactory
          ? input.plannedSessionRepositoryFactory(transactionDb)
          : createDrizzlePlannedSessionRepository(transactionDb);
        const activePlanLookup =
          await transactionRepository.getActivePlanFromFutureEvents(profileId);
        const activeSchedule = (() => {
          if (!activePlanLookup) return null;
          const scheduleBatchId = activePlanLookup.scheduleBatchId;
          if (!scheduleBatchId) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The active training plan schedule is missing its generation ID and cannot be safely replaced. Remove or repair that schedule before applying a new plan.",
            });
          }
          return { scheduleBatchId, trainingPlanId: activePlanLookup.trainingPlanId };
        })();
        if (activePlanLookup && !input.values.replace_existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "You already have scheduled sessions from another training plan. Replace them first.",
          });
        }

        const candidates = activeSchedule
          ? await ((): Promise<Array<{ id: string }>> => {
              const candidateQuery = tx
                .select({ id: schema.events.id })
                .from(schema.events)
                .where(
                  and(
                    eq(schema.events.profile_id, profileId),
                    eq(schema.events.event_type, plannedEventType),
                    gte(schema.events.starts_at, new Date(todayStart)),
                    ne(schema.events.status, "completed"),
                    eq(schema.events.training_plan_id, activeSchedule.trainingPlanId),
                    eq(schema.events.schedule_batch_id, activeSchedule.scheduleBatchId),
                  ),
                )
                .orderBy(asc(schema.events.id));
              const lockableCandidateQuery = candidateQuery as typeof candidateQuery & {
                for?: (strength: "update") => typeof candidateQuery;
              };
              return lockableCandidateQuery.for
                ? lockableCandidateQuery.for("update")
                : candidateQuery;
            })()
          : [];

        const permissions = input.permissionsFactory?.(transactionDb) ?? input.permissions;
        for (const event of candidates) {
          await permissions.revokeEventGrants(event.id);
        }
        const unsyncResult = await enqueueWahooPlannedActivitySyncAfterCalendarMutation({
          db: transactionDb,
          eventIds: candidates.map((event) => event.id),
          operation: "unsync",
          profileId,
          transaction: tx,
        });
        if (unsyncResult && !unsyncResult.success) {
          throw new Error(
            "Failed to queue provider unsync for the replaced training plan schedule.",
          );
        }
        const removedEvents = candidates.length
          ? await tx
              .delete(schema.events)
              .where(
                inArray(
                  schema.events.id,
                  candidates.map((event) => event.id),
                ),
              )
              .returning({ id: schema.events.id })
          : [];

        if (activeSchedule) {
          const existingPlannedSessions = await plannedSessionRepository.listOwnedRange({
            profileId,
            startDate: todayDate,
            endDate: addDaysDateOnlyUtc(todayDate, 800),
            limit: 10_000,
          });
          const retainedIdentities = new Set(
            plannedSessionInputs.map((session) => session.idempotencyKey),
          );
          for (const session of existingPlannedSessions.items) {
            if (
              session.lifecycle.status !== "scheduled" ||
              session.source.kind !== "training_plan" ||
              session.source.trainingPlanId !== activeSchedule.trainingPlanId ||
              retainedIdentities.has(session.idempotencyKey)
            ) {
              continue;
            }
            await cancelPlannedSession({
              repository: plannedSessionRepository,
              profileId,
              sessionId: session.id,
              expectedRevision: session.sessionRevision,
              reason: "plan_replaced",
              cancelledAt: new Date().toISOString(),
            });
          }
        }

        let createdPlannedSessions = 0;
        let replayedPlannedSessions = 0;
        for (const session of plannedSessionInputs) {
          const result = await createPlannedSession({
            repository: plannedSessionRepository,
            profileId,
            session,
          });
          if (result.status === "created") createdPlannedSessions += 1;
          else replayedPlannedSessions += 1;
        }

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
              isPublic: templatePlan.content_visibility === "public",
              isSystem: templatePlan.is_system_template,
            },
            profileId,
          );

          if (!shouldGrantLinkedPlan && !shouldGrantTrainingPlan) {
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

        const publishResult = await enqueueWahooPlannedActivitySyncAfterCalendarMutation({
          db: transactionDb,
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
          createdPlannedSessions,
          replayedPlannedSessions,
        };
      },
    );

  return {
    applied_plan_id: appliedPlanId,
    training_plan_id: templatePlan.id,
    application_mode: materializedApplication.applicationMode,
    schedule_batch_id,
    scheduled_sessions_created: insertedEvents.length,
    scheduled_sessions_skipped: materializedApplication.skippedSessions,
    scheduled_sessions_replaced: removedEvents.length,
    planned_sessions_created: createdPlannedSessions,
    planned_sessions_replayed: replayedPlannedSessions,
    cache_tags: PLANNED_SESSION_CACHE_TAGS,
  };
}
