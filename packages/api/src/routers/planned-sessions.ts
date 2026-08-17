import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
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
  PlannedSessionIdentityConflictError,
  PlannedSessionNotFoundError,
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
} from "../application/calendar/planned-session-errors";
import { readPlannedSessionRange } from "../application/calendar/read-planned-session-range";
import { PLANNED_SESSION_CACHE_TAGS } from "../contracts/cache-receipts";
import {
  cancelPlannedSessionDtoRequestSchema,
  createPlannedSessionDtoRequestSchema,
  linkPlannedSessionCompletionDtoRequestSchema,
  linkPlannedSessionGroupEventDtoRequestSchema,
  movePlannedSessionDtoRequestSchema,
  plannedSessionMutationReceiptSchema,
  plannedSessionRangeDtoSchema,
  readPlannedSessionsRangeRequestSchema,
  toPlannedSessionDto,
} from "../contracts/planned-sessions";
import { getRequiredDb } from "../db";
import { createDrizzlePlannedSessionRepository } from "../infrastructure/repositories";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type PlannedSessionRouterDependencies = {
  createDirect: typeof createDirectPlannedSession;
  readRange: typeof readPlannedSessionRange;
  move: typeof movePlannedSession;
  cancel: typeof cancelPlannedSession;
  linkCompletion: typeof linkPlannedSessionCompletion;
  linkGroupEvent: typeof linkPlannedSessionGroupEvent;
  unlinkGroupEvent: typeof unlinkPlannedSessionGroupEvent;
  createId: () => string;
  now: () => Date;
};

function assertOwnedProfile(actorProfileId: string, profileId: string) {
  if (actorProfileId !== profileId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this profile" });
  }
}

function mapPlannedSessionError(error: unknown): never {
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
    error instanceof PlannedSessionIdentityConflictError ||
    error instanceof PlannedSessionStateConflictError
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Planned session changed", cause: error });
  }
  throw error;
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
    linkGroupEvent: dependencies.linkGroupEvent ?? linkPlannedSessionGroupEvent,
    unlinkGroupEvent: dependencies.unlinkGroupEvent ?? unlinkPlannedSessionGroupEvent,
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
          const result = await services.createDirect({
            db,
            repository: createDrizzlePlannedSessionRepository(db),
            profileId: input.profileId,
            planningDate: input.session.planningDate,
            source: input.session.source,
            sessionId: services.createId(),
            groupEventId: input.session.groupEventId ?? null,
            activityPlanId: input.session.activityPlanId,
            capturedAt: services.now(),
          });
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
    move: protectedProcedure
      .input(movePlannedSessionDtoRequestSchema)
      .output(plannedSessionMutationReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedProfile(ctx.session.user.id, input.profileId);
        try {
          const session = await services.move({ repository: repository(ctx), ...input });
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
          const session = await services.cancel({
            repository: repository(ctx),
            ...input,
            cancelledAt: new Date().toISOString(),
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
          const session = await services.linkCompletion({
            repository: repository(ctx),
            ...input,
            linkedAt: new Date().toISOString(),
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
