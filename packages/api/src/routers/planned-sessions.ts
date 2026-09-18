import { randomUUID } from "node:crypto";
import { buildPlannedSessionComparison } from "@repo/core/calendar";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { cancelPlannedSession } from "../application/calendar/cancel-planned-session";
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
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
} from "../application/calendar/planned-session-errors";
import { readPlannedSessionCompletionCandidates } from "../application/calendar/read-planned-session-completion-candidates";
import { readPlannedSessionRange } from "../application/calendar/read-planned-session-range";
import {
  ManualCompletionReconciliationConflictError,
  reconcileManualPlannedSessionCompletion,
} from "../application/calendar/reconcile-manual-planned-session-completion";
import { skipPlannedSession } from "../application/calendar/skip-planned-session";
import { PLANNED_SESSION_CACHE_TAGS } from "../contracts/cache-receipts";
import {
  cancelPlannedSessionDtoRequestSchema,
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
import { enqueueWahooPlannedSessionSyncAfterMutation } from "../lib/provider-sync/planned-activities";
import { readOwnedLinkedActivityObservation } from "../repositories/planned-session-completion-candidate-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type PlannedSessionRouterDependencies = {
  createDirect: typeof createDirectPlannedSession;
  readRange: typeof readPlannedSessionRange;
  move: typeof movePlannedSession;
  cancel: typeof cancelPlannedSession;
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

  return createTRPCRouter({
    create: protectedProcedure
      .input(createPlannedSessionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          const result = await withProfileFencedRepeatableReadSnapshot(
            db,
            input.profileId,
            async (tx) => {
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
              return result;
            },
          );
          return receipt(result.status, toPlannedSessionDto(result.session));
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
          items: result.items.map(toPlannedSessionDto),
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
          ...toPlannedSessionDto(session),
          comparison: buildPlannedSessionComparison({
            session: {
              prescription: session.prescription,
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
          const session = await db.transaction(async (tx) => {
            const session = await services.move({
              repository: createDrizzlePlannedSessionRepository(tx),
              ...input,
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
            return session;
          });
          return receipt("updated", toPlannedSessionDto(session));
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
          const session = await db.transaction(async (tx) => {
            const session = await services.cancel({
              repository: createDrizzlePlannedSessionRepository(tx),
              ...input,
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
            return session;
          });
          return receipt("updated", toPlannedSessionDto(session));
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
          return receipt(result.outcome, toPlannedSessionDto(result.session));
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
          return receipt("updated", toPlannedSessionDto(session));
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
          return receipt("updated", toPlannedSessionDto(session));
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
          return receipt("updated", toPlannedSessionDto(session));
        } catch (error) {
          return mapPlannedSessionError(error);
        }
      }),
  });
}

export const plannedSessionsRouter = createPlannedSessionsRouter();
