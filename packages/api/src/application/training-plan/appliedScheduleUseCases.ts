import { createHash } from "node:crypto";
import { formatDateOnlyInTimeZone, ianaTimezoneSchema } from "@repo/core";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import { schema, trainingPlanApplicationCommandReceipts, trainingPlanApplications } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { enqueueWahooPlannedSessionSyncAfterMutation } from "../../lib/provider-sync/planned-activities";
import type { PlannedSessionRepositoryPort } from "../../repositories";
import { cancelPlannedSession } from "../calendar/cancel-planned-session";

function getRequiredPlanningTimezone(value: string | null | undefined): string {
  const parsed = ianaTimezoneSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "A valid planning timezone is required to manage a training schedule.",
  });
}

export function getPlanningDateForClock(input: { now: Date; planningTimezone: string }) {
  return formatDateOnlyInTimeZone(input.now, input.planningTimezone);
}

export async function getCurrentAthletePlanningDate(input: {
  db: DrizzleQueryExecutor;
  now?: Date;
  profileId: string;
}) {
  const [profile] = await input.db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, input.profileId))
    .limit(1);
  const planningTimezone = getRequiredPlanningTimezone(profile?.planningTimezone);
  return getPlanningDateForClock({ now: input.now ?? new Date(), planningTimezone });
}

export async function getAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  trainingPlanId: string;
}) {
  const todayDate = await getCurrentAthletePlanningDate(input);
  const [schedule] = await input.db
    .select({
      applicationId: trainingPlanApplications.id,
      planningDate: schema.plannedSessions.planning_date,
      trainingPlanRevision: schema.plannedSessions.training_plan_revision,
    })
    .from(trainingPlanApplications)
    .innerJoin(
      schema.plannedSessions,
      eq(schema.plannedSessions.training_plan_application_id, trainingPlanApplications.id),
    )
    .where(
      and(
        eq(trainingPlanApplications.profile_id, input.profileId),
        eq(trainingPlanApplications.training_plan_id, input.trainingPlanId),
        gt(schema.plannedSessions.planning_date, todayDate),
        eq(schema.plannedSessions.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
    .limit(1);

  if (!schedule) return null;

  return {
    application_id: schedule.applicationId,
    application_receipt: schedule.applicationId,
    planning_date: schedule.planningDate,
    training_plan_id: input.trainingPlanId,
  };
}

export async function listAppliedSchedulesUseCase(input: {
  cursor?: string;
  db: DrizzleDbClient;
  limit: number;
  profileId: string;
  trainingPlanId: string;
}) {
  const todayDate = await getCurrentAthletePlanningDate(input);
  const futureScheduled = sql<boolean>`${schema.plannedSessions.status} = 'scheduled' and ${schema.plannedSessions.planning_date} > ${todayDate}`;
  const rows = await input.db
    .select({
      applicationId: trainingPlanApplications.id,
      applicationRevision: trainingPlanApplications.application_revision,
      eligibleFutureCount: sql<number>`count(*) filter (where ${futureScheduled})::int`,
      nextPlanningDate: sql<
        string | null
      >`min(${schema.plannedSessions.planning_date}) filter (where ${futureScheduled})`,
      protectedCount: sql<number>`count(*) filter (where not (${futureScheduled}))::int`,
      sourceRevision: trainingPlanApplications.source_revision,
      startDate: trainingPlanApplications.start_date,
    })
    .from(trainingPlanApplications)
    .innerJoin(
      schema.plannedSessions,
      eq(schema.plannedSessions.training_plan_application_id, trainingPlanApplications.id),
    )
    .where(
      and(
        eq(trainingPlanApplications.profile_id, input.profileId),
        eq(trainingPlanApplications.training_plan_id, input.trainingPlanId),
        input.cursor ? gt(trainingPlanApplications.id, input.cursor) : undefined,
      ),
    )
    .groupBy(
      trainingPlanApplications.id,
      trainingPlanApplications.start_date,
      trainingPlanApplications.source_revision,
      trainingPlanApplications.application_revision,
    )
    .orderBy(asc(trainingPlanApplications.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  return {
    items: page.map((row) => ({
      application_id: row.applicationId,
      application_revision: row.applicationRevision,
      eligible_future_count: row.eligibleFutureCount,
      next_planning_date: row.nextPlanningDate,
      protected_count: row.protectedCount,
      source_revision: row.sourceRevision,
      start_date: row.startDate,
    })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.applicationId ?? null) : null,
  };
}

const operationIdSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const hashSchema = z.string().regex(/^v1:sha256:[0-9a-f]{64}$/);
export const appliedScheduleRemovalPreviewInputSchema = z
  .object({ applicationId: z.string().uuid() })
  .strict();
export const appliedScheduleRemovalInputSchema = appliedScheduleRemovalPreviewInputSchema
  .extend({ operationId: operationIdSchema, previewFingerprint: hashSchema })
  .strict();

export function removalFingerprint(input: {
  applicationId: string;
  applicationRevision: number;
  todayDate: string;
  sessions: Array<{ id: string; sessionRevision: number }>;
}) {
  return `v1:sha256:${createHash("sha256").update(stringifyCanonicalJson(input)).digest("hex")}`;
}

async function loadRemovalPreview(input: {
  db: DrizzleDbClient | DrizzleTransactionClient;
  profileId: string;
  applicationId: string;
  todayDate: string;
  lock: boolean;
}) {
  const applicationQuery = input.db
    .select({ applicationRevision: trainingPlanApplications.application_revision })
    .from(trainingPlanApplications)
    .where(
      and(
        eq(trainingPlanApplications.id, input.applicationId),
        eq(trainingPlanApplications.profile_id, input.profileId),
      ),
    )
    .limit(1);
  const lockableApplicationQuery = applicationQuery as typeof applicationQuery & {
    for?: (strength: "update") => typeof applicationQuery;
  };
  const [application] =
    input.lock && lockableApplicationQuery.for
      ? await lockableApplicationQuery.for("update")
      : await applicationQuery;
  if (!application) return null;
  const sessionsQuery = input.db
    .select({
      id: schema.plannedSessions.id,
      sessionRevision: schema.plannedSessions.session_revision,
    })
    .from(schema.plannedSessions)
    .where(
      and(
        eq(schema.plannedSessions.profile_id, input.profileId),
        eq(schema.plannedSessions.training_plan_application_id, input.applicationId),
        eq(schema.plannedSessions.status, "scheduled"),
        gt(schema.plannedSessions.planning_date, input.todayDate),
      ),
    )
    .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id));
  const lockable = sessionsQuery as typeof sessionsQuery & {
    for?: (strength: "update") => typeof sessionsQuery;
  };
  const sessions = input.lock && lockable.for ? await lockable.for("update") : await sessionsQuery;
  const fingerprint = removalFingerprint({
    applicationId: input.applicationId,
    applicationRevision: application.applicationRevision,
    todayDate: input.todayDate,
    sessions,
  });
  return { applicationRevision: application.applicationRevision, sessions, fingerprint };
}

export async function previewRemoveAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  applicationId: string;
  now?: Date;
}) {
  const todayDate = await getCurrentAthletePlanningDate(input);
  const preview = await loadRemovalPreview({ ...input, todayDate, lock: false });
  if (!preview)
    throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled plan application not found" });
  return {
    status: "available" as const,
    applicationId: input.applicationId,
    applicationRevision: preview.applicationRevision,
    affected: preview.sessions,
    protected: [],
    cutoffDate: todayDate,
    previewFingerprint: preview.fingerprint,
  };
}

export async function removeAppliedScheduleUseCase(input: {
  db: DrizzleDbClient;
  plannedSessionRepositoryFactory?: (db: DrizzleTransactionClient) => PlannedSessionRepositoryPort;
  enqueueWahooPlannedSessionSyncAfterMutation?: typeof enqueueWahooPlannedSessionSyncAfterMutation;
  profileId: string;
  applicationId: string;
  operationId: string;
  previewFingerprint: string;
  now?: Date;
}) {
  const values = appliedScheduleRemovalInputSchema.parse({
    applicationId: input.applicationId,
    operationId: input.operationId,
    previewFingerprint: input.previewFingerprint,
  });
  const todayDate = await getCurrentAthletePlanningDate(input);
  const cancelledSessions = await input.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.profileId}, 0))`);
    const [receipt] = await tx
      .select({
        fingerprint: trainingPlanApplicationCommandReceipts.request_fingerprint,
        result: trainingPlanApplicationCommandReceipts.result,
      })
      .from(trainingPlanApplicationCommandReceipts)
      .where(
        and(
          eq(trainingPlanApplicationCommandReceipts.profile_id, input.profileId),
          eq(trainingPlanApplicationCommandReceipts.operation_id, values.operationId),
        ),
      )
      .limit(1);
    if (receipt) {
      if (receipt.fingerprint !== values.previewFingerprint)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Operation ID was already used for another request",
        });
      return receipt.result;
    }
    const preview = await loadRemovalPreview({
      db: tx,
      profileId: input.profileId,
      applicationId: values.applicationId,
      todayDate,
      lock: true,
    });
    if (!preview)
      throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled plan application not found" });
    if (preview.fingerprint !== values.previewFingerprint)
      throw new TRPCError({ code: "CONFLICT", message: "Schedule review is stale" });
    const plannedSessions = preview.sessions;
    if (plannedSessions.length === 0)
      throw new TRPCError({ code: "NOT_FOUND", message: "No future scheduled sessions found" });
    const plannedSessionRepository = input.plannedSessionRepositoryFactory
      ? input.plannedSessionRepositoryFactory(tx)
      : createDrizzlePlannedSessionRepository(tx);
    const cancelledAt = (input.now ?? new Date()).toISOString();
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
    const providerQueue = await (
      input.enqueueWahooPlannedSessionSyncAfterMutation ??
      enqueueWahooPlannedSessionSyncAfterMutation
    )({
      db: input.db,
      transaction: tx,
      plannedSessionIds: plannedSessions.map((session) => session.id),
      operation: "unsync",
      profileId: input.profileId,
    });
    if (providerQueue?.success === false) {
      throw new Error("Unable to durably enqueue planned-session provider cleanup");
    }
    const result = {
      success: true,
      application_id: values.applicationId,
      scheduled_sessions_removed: plannedSessions.length,
    };
    await tx.insert(trainingPlanApplicationCommandReceipts).values({
      profile_id: input.profileId,
      operation_id: values.operationId,
      command: "remove",
      request_fingerprint: values.previewFingerprint,
      application_id: values.applicationId,
      result,
    });
    return result;
  });

  return cancelledSessions;
}
