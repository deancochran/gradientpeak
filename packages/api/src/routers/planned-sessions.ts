import { randomUUID } from "node:crypto";
import { recordingPlannedSessionLaunchSchema } from "@repo/core";
import { buildPlannedSessionComparison, type PlannedSession } from "@repo/core/calendar";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { cancelPlannedSession } from "../application/calendar/cancel-planned-session";
import { changePlannedSessionPlan } from "../application/calendar/change-planned-session-plan";
import { createDirectPlannedSession } from "../application/calendar/create-direct-planned-session";
import { linkPlannedSessionCompletion } from "../application/calendar/link-planned-session-completion";
import {
  linkPlannedSessionGroupEvent,
  unlinkPlannedSessionGroupEvent,
} from "../application/calendar/link-planned-session-group-event";
import { movePlannedSession } from "../application/calendar/move-planned-session";
import {
  PlannedSessionAccessError,
  PlannedSessionFutureDateError,
  PlannedSessionIdentityConflictError,
  PlannedSessionNotFoundError,
  PlannedSessionPrescriptionPreconditionError,
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
} from "../application/calendar/planned-session-errors";
import { readPlannedSessionCompletionCandidates } from "../application/calendar/read-planned-session-completion-candidates";
import { readPlannedSessionRange } from "../application/calendar/read-planned-session-range";
import {
  ManualCompletionReconciliationConflictError,
  reconcileManualPlannedSessionCompletion,
} from "../application/calendar/reconcile-manual-planned-session-completion";
import { resolveCurrentPlannedSessionRecordingLaunch } from "../application/calendar/resolve-current-planned-session-recording-launch";
import { skipPlannedSession } from "../application/calendar/skip-planned-session";
import {
  executeWithOperationReceipt,
  OperationReceiptConflictError,
  OperationReceiptCorruptError,
  OperationReceiptUnauthorizedError,
} from "../application/operation-receipts";
import { PLANNED_SESSION_CACHE_TAGS } from "../contracts/cache-receipts";
import {
  cancelPlannedSessionDtoRequestSchema,
  changePlannedSessionPlanDtoRequestSchema,
  createPlannedSessionDtoRequestSchema,
  linkPlannedSessionCompletionDtoRequestSchema,
  linkPlannedSessionGroupEventDtoRequestSchema,
  movePlannedSessionDtoRequestSchema,
  plannedSessionCompletionCandidatesDtoSchema,
  plannedSessionCompletionCandidatesRequestSchema,
  plannedSessionDetailDtoSchema,
  plannedSessionMutationReceiptSchema,
  plannedSessionRangeDtoSchema,
  readPlannedSessionsRangeRequestSchema,
  skipPlannedSessionDtoRequestSchema,
  toPlannedSessionDto,
} from "../contracts/planned-sessions";
import { getRequiredDb, withProfileFencedRepeatableReadSnapshot } from "../db";
import { createDrizzlePlannedSessionRepository } from "../infrastructure/repositories";
import { enqueueGarminPlannedSessionSync } from "../infrastructure/repositories/drizzle-garmin-training-sync-repository";
import { enqueueWahooPlannedSessionSyncAfterMutation } from "../lib/provider-sync/planned-activities";
import { readOwnedLinkedActivityObservation } from "../repositories/planned-session-completion-candidate-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type PlannedSessionRouterDependencies = {
  createDirect: typeof createDirectPlannedSession;
  readRange: typeof readPlannedSessionRange;
  move: typeof movePlannedSession;
  cancel: typeof cancelPlannedSession;
  changePlanOnly: typeof changePlannedSessionPlan;
  linkCompletion: typeof linkPlannedSessionCompletion;
  reconcileManualCompletion: typeof reconcileManualPlannedSessionCompletion;
  completionCandidates: typeof readPlannedSessionCompletionCandidates;
  skip: typeof skipPlannedSession;
  linkGroupEvent: typeof linkPlannedSessionGroupEvent;
  unlinkGroupEvent: typeof unlinkPlannedSessionGroupEvent;
  readLinkedActivityObservation: typeof readOwnedLinkedActivityObservation;
  createId: () => string;
  now: () => Date;
};

function assertOwnedProfile(actorProfileId: string, profileId: string) {
  if (actorProfileId !== profileId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this profile" });
  }
}

function mapPlannedSessionError(error: unknown): never {
  if (error instanceof OperationReceiptConflictError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Operation ID was already used differently.",
    });
  }
  if (error instanceof OperationReceiptUnauthorizedError) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Planned session not found" });
  }
  if (error instanceof OperationReceiptCorruptError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Operation receipt is invalid.",
    });
  }
  if (error instanceof z.ZodError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selected plan does not satisfy current authoring policy",
      cause: error,
    });
  }
  if (error instanceof PlannedSessionAccessError) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Planned session access denied",
      cause: error,
    });
  }
  if (error instanceof PlannedSessionPrescriptionPreconditionError) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof PlannedSessionNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Planned session not found", cause: error });
  }
  if (
    error instanceof PlannedSessionStaleRevisionError ||
    error instanceof PlannedSessionFutureDateError ||
    error instanceof PlannedSessionIdentityConflictError ||
    error instanceof PlannedSessionStateConflictError ||
    error instanceof ManualCompletionReconciliationConflictError
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Planned session changed", cause: error });
  }
  throw error;
}

function requireDurableProviderQueue(result: { success: boolean } | null) {
  if (result?.success === false) {
    throw new Error("Unable to durably enqueue planned-session provider follow-up");
  }
}

export function createPlannedSessionsRouter(
  dependencies: Partial<PlannedSessionRouterDependencies> = {},
) {
  const services: PlannedSessionRouterDependencies = {
    createDirect: dependencies.createDirect ?? createDirectPlannedSession,
    readRange: dependencies.readRange ?? readPlannedSessionRange,
    move: dependencies.move ?? movePlannedSession,
    cancel: dependencies.cancel ?? cancelPlannedSession,
    changePlanOnly: dependencies.changePlanOnly ?? changePlannedSessionPlan,
    linkCompletion: dependencies.linkCompletion ?? linkPlannedSessionCompletion,
    reconcileManualCompletion:
      dependencies.reconcileManualCompletion ?? reconcileManualPlannedSessionCompletion,
    completionCandidates:
      dependencies.completionCandidates ?? readPlannedSessionCompletionCandidates,
    skip: dependencies.skip ?? skipPlannedSession,
    linkGroupEvent: dependencies.linkGroupEvent ?? linkPlannedSessionGroupEvent,
    unlinkGroupEvent: dependencies.unlinkGroupEvent ?? unlinkPlannedSessionGroupEvent,
    readLinkedActivityObservation:
      dependencies.readLinkedActivityObservation ?? readOwnedLinkedActivityObservation,
    createId: dependencies.createId ?? randomUUID,
    now: dependencies.now ?? (() => new Date()),
  };
  const repository = (ctx: Parameters<typeof getRequiredDb>[0]) =>
    createDrizzlePlannedSessionRepository(getRequiredDb(ctx));
  const receipt = (outcome: "created" | "unchanged" | "updated", session: unknown) =>
    plannedSessionMutationReceiptSchema.parse({
      outcome,
      session,
      cache_tags: PLANNED_SESSION_CACHE_TAGS,
    });
  // List/detail reads expose the durable reference and optional legacy provenance.
  // Recording launch is the only boundary that captures a current executable plan.
  const toCurrentPlanDto = (session: PlannedSession) => toPlannedSessionDto(session);

  return createTRPCRouter({
    create: protectedProcedure
      .input(createPlannedSessionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          const result = await withProfileFencedRepeatableReadSnapshot(db, input.profileId, (tx) =>
            executeWithOperationReceipt({
              tx,
              actorId: ctx.session.user.id,
              ...(input.operationId ? { operationId: input.operationId } : {}),
              command: "chatbot.planned-sessions.create",
              semanticInput: { profileId: input.profileId, session: input.session },
              output: plannedSessionMutationReceiptSchema,
              authorize: async () => ctx.session.user.id === input.profileId,
              mutate: async () => {
                const result = await services.createDirect({
                  db: tx,
                  repository: createDrizzlePlannedSessionRepository(tx),
                  profileId: input.profileId,
                  planningDate: input.session.planningDate,
                  source: input.session.source,
                  sessionId: services.createId(),
                  groupEventId: input.session.groupEventId ?? null,
                  activityPlanId: input.session.activityPlanId,
                  ...(input.session.demand === undefined ? {} : { demand: input.session.demand }),
                  capturedAt: services.now(),
                });
                requireDurableProviderQueue(
                  await enqueueWahooPlannedSessionSyncAfterMutation({
                    db,
                    transaction: tx,
                    plannedSessionIds: [result.session.id],
                    operation: "publish",
                    profileId: input.profileId,
                  }),
                );
                await enqueueGarminPlannedSessionSync({
                  db,
                  transaction: tx,
                  plannedSessionId: result.session.id,
                  planningDate: result.session.planningDate,
                  operation: "publish",
                  profileId: input.profileId,
                  now: services.now(),
                });
                return receipt(result.status, toCurrentPlanDto(result.session));
              },
            }),
          );
          return result;
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    range: protectedProcedure
      .input(readPlannedSessionsRangeRequestSchema)
      .output(plannedSessionRangeDtoSchema)
      .query(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        const result = await services.readRange({
          repository: repository(ctx),
          profileId: input.profileId,
          startDate: input.range.startDate,
          endDate: input.range.endDate,
        });
        return plannedSessionRangeDtoSchema.parse({
          items: result.items.map(toCurrentPlanDto),
          truncated: result.truncated,
        });
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }).strict())
      .output(plannedSessionDetailDtoSchema)
      .query(async ({ ctx, input }) => {
        const session = await repository(ctx).getOwned({
          profileId: ctx.session.user.id,
          sessionId: input.id,
        });
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Planned session not found" });
        }
        const linkedActivityId =
          session.lifecycle.status === "completed" &&
          session.lifecycle.completion.state === "linked"
            ? session.lifecycle.completion.activityId
            : null;
        const activity = linkedActivityId
          ? await services.readLinkedActivityObservation(getRequiredDb(ctx), {
              activityId: linkedActivityId,
              profileId: ctx.session.user.id,
            })
          : null;
        return plannedSessionDetailDtoSchema.parse({
          ...toCurrentPlanDto(session),
          comparison: buildPlannedSessionComparison({
            session: {
              ...(session.prescription ? { prescription: session.prescription } : {}),
              lifecycle: session.lifecycle,
            },
            actual: {
              durationSeconds:
                activity?.elapsedMs === undefined || activity.elapsedMs === null
                  ? null
                  : activity.elapsedMs / 1000,
              distanceMeters: activity?.distanceMeters ?? null,
            },
          }),
        });
      }),
    recordingLaunch: protectedProcedure
      .input(z.object({ id: z.string().uuid() }).strict())
      .output(recordingPlannedSessionLaunchSchema)
      .mutation(async ({ ctx, input }) => {
        const session = await repository(ctx).getOwned({
          profileId: ctx.session.user.id,
          sessionId: input.id,
        });
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Planned session not found" });
        }
        if (session.lifecycle.status !== "scheduled") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Planned session is not available to record",
          });
        }
        const launch = await resolveCurrentPlannedSessionRecordingLaunch({
          db: getRequiredDb(ctx),
          repository: repository(ctx),
          profileId: ctx.session.user.id,
          session,
          capturedAt: services.now(),
        });
        if (!launch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Current activity plan is unavailable",
          });
        }
        return launch;
      }),
    completionCandidates: protectedProcedure
      .input(plannedSessionCompletionCandidatesRequestSchema)
      .output(plannedSessionCompletionCandidatesDtoSchema)
      .query(async ({ ctx, input }) => {
        try {
          const result = await services.completionCandidates({
            db: getRequiredDb(ctx),
            repository: repository(ctx),
            profileId: ctx.session.user.id,
            sessionId: input.sessionId,
            limit: input.limit,
            ...(input.cursor
              ? { cursor: { startedAt: new Date(input.cursor.startedAt), id: input.cursor.id } }
              : {}),
          });
          return plannedSessionCompletionCandidatesDtoSchema.parse({
            ...result,
            items: result.items.map((item) => ({
              ...item,
              startedAt: item.startedAt.toISOString(),
            })),
            nextCursor: result.nextCursor && {
              id: result.nextCursor.id,
              startedAt: result.nextCursor.startedAt.toISOString(),
            },
          });
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    move: protectedProcedure
      .input(movePlannedSessionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          return await db.transaction((tx) =>
            executeWithOperationReceipt({
              tx,
              actorId: ctx.session.user.id,
              ...(input.operationId ? { operationId: input.operationId } : {}),
              command: "chatbot.planned-sessions.move",
              semanticInput: {
                profileId: input.profileId,
                sessionId: input.sessionId,
                expectedRevision: input.expectedRevision,
                planningDate: input.planningDate,
              },
              output: plannedSessionMutationReceiptSchema,
              authorize: async (executor) =>
                !input.operationId ||
                Boolean(
                  await createDrizzlePlannedSessionRepository(executor).getOwned({
                    profileId: ctx.session.user.id,
                    sessionId: input.sessionId,
                  }),
                ),
              mutate: async () => {
                const session = await services.move({
                  repository: createDrizzlePlannedSessionRepository(tx),
                  profileId: input.profileId,
                  sessionId: input.sessionId,
                  expectedRevision: input.expectedRevision,
                  planningDate: input.planningDate,
                });
                requireDurableProviderQueue(
                  await enqueueWahooPlannedSessionSyncAfterMutation({
                    db,
                    transaction: tx,
                    plannedSessionIds: [session.id],
                    operation: "publish",
                    profileId: input.profileId,
                  }),
                );
                await enqueueGarminPlannedSessionSync({
                  db,
                  transaction: tx,
                  plannedSessionId: session.id,
                  planningDate: session.planningDate,
                  operation: "publish",
                  profileId: input.profileId,
                  now: services.now(),
                });
                return receipt("updated", toCurrentPlanDto(session));
              },
            }),
          );
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    changePlanOnly: protectedProcedure
      .input(changePlannedSessionPlanDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          const session = await db.transaction(async (tx) => {
            const session = await services.changePlanOnly({
              db,
              transaction: tx,
              profileId: input.profileId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
              ...(input.newName === undefined ? {} : { newName: input.newName }),
            });
            // Publishing this durable session ID supersedes its previous desired
            // Wahoo payload in the existing per-session queue lane.
            requireDurableProviderQueue(
              await enqueueWahooPlannedSessionSyncAfterMutation({
                db,
                transaction: tx,
                plannedSessionIds: [session.id],
                operation: "publish",
                profileId: input.profileId,
              }),
            );
            await enqueueGarminPlannedSessionSync({
              db,
              transaction: tx,
              plannedSessionId: session.id,
              planningDate: session.planningDate,
              operation: "publish",
              profileId: input.profileId,
              now: services.now(),
            });
            return session;
          });
          return receipt("updated", toCurrentPlanDto(session));
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    cancel: protectedProcedure
      .input(cancelPlannedSessionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          return await db.transaction((tx) =>
            executeWithOperationReceipt({
              tx,
              actorId: ctx.session.user.id,
              ...(input.operationId ? { operationId: input.operationId } : {}),
              command: "chatbot.planned-sessions.cancel",
              semanticInput: {
                profileId: input.profileId,
                sessionId: input.sessionId,
                expectedRevision: input.expectedRevision,
                reason: input.reason,
              },
              output: plannedSessionMutationReceiptSchema,
              authorize: async (executor) =>
                !input.operationId ||
                Boolean(
                  await createDrizzlePlannedSessionRepository(executor).getOwned({
                    profileId: ctx.session.user.id,
                    sessionId: input.sessionId,
                  }),
                ),
              mutate: async () => {
                const session = await services.cancel({
                  repository: createDrizzlePlannedSessionRepository(tx),
                  profileId: input.profileId,
                  sessionId: input.sessionId,
                  expectedRevision: input.expectedRevision,
                  reason: input.reason,
                  cancelledAt: services.now().toISOString(),
                });
                requireDurableProviderQueue(
                  await enqueueWahooPlannedSessionSyncAfterMutation({
                    db,
                    transaction: tx,
                    plannedSessionIds: [session.id],
                    operation: "unsync",
                    profileId: input.profileId,
                  }),
                );
                await enqueueGarminPlannedSessionSync({
                  db,
                  transaction: tx,
                  plannedSessionId: session.id,
                  planningDate: session.planningDate,
                  operation: "cancel",
                  profileId: input.profileId,
                  now: services.now(),
                });
                return receipt("updated", toCurrentPlanDto(session));
              },
            }),
          );
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    linkCompletion: protectedProcedure
      .input(linkPlannedSessionCompletionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          const result = await db.transaction((tx) =>
            services.reconcileManualCompletion({
              tx,
              profileId: input.profileId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
              activityId: input.activityId,
              operationId: input.operationId,
              reconciledAt: services.now(),
            }),
          );
          return receipt(result.outcome, toCurrentPlanDto(result.session));
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    skip: protectedProcedure
      .input(skipPlannedSessionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const now = services.now();
          const session = await services.skip({
            db: getRequiredDb(ctx),
            ...input,
            skippedAt: now.toISOString(),
            now,
          });
          return receipt("updated", toCurrentPlanDto(session));
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    linkGroupEvent: protectedProcedure
      .input(linkPlannedSessionGroupEventDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const session = await services.linkGroupEvent({ repository: repository(ctx), ...input });
          return receipt("updated", toCurrentPlanDto(session));
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
    unlinkGroupEvent: protectedProcedure
      .input(linkPlannedSessionGroupEventDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const session = await services.unlinkGroupEvent({
            repository: repository(ctx),
            ...input,
          });
          return receipt("updated", toCurrentPlanDto(session));
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
  });
}

export const plannedSessionsRouter = createPlannedSessionsRouter();
