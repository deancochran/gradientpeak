import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type { DrizzleTransactionClient } from "../../db";
import { getRequiredDb } from "../../db";
import type { createEventCompletionRepository } from "../../infrastructure/repositories";
import { logger } from "../../lib/logger";
import type { PlannedWorkoutQueueResult } from "../../lib/provider-sync/planned-workouts";
import { drainDueWahooPlannedWorkoutJobs } from "../../lib/provider-sync/wahoo-planned-workout-drain";
import type { createContentAccessPermissions } from "../../permissions/content-access";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "planned" | "race_target" | "custom" | "imported";
type DbEventType = "planned" | "race_target" | "custom" | "imported";
type EventMutationScope = "single" | "future" | "series";

type EventRecord = {
  activity_plan_id: string | null;
  event_type: DbEventType;
  id: string;
  series_id: string | null;
  starts_at: string;
  training_plan_id: string | null;
  updated_at: string;
};

type ContentPermissions = ReturnType<typeof createContentAccessPermissions> | null;

type DeleteEventUseCaseDependencies = {
  buildInsightRefreshHint: (params: {
    trainingPlanId?: string | null;
    changedDate?: string | null;
    changeAt?: string;
  }) => unknown;
  enqueueProviderPlannedActivityJobs: (
    ctx: ProtectedContext,
    input: {
      drainDueJobs?: boolean;
      eventIds: string[];
      operation: "publish" | "unsync";
      profileId?: string;
      transaction?: DrizzleTransactionClient;
    },
  ) => Promise<PlannedWorkoutQueueResult | null>;
  getContentPermissions: (
    ctx: Context,
    transaction?: DrizzleTransactionClient,
  ) => ContentPermissions;
  getEventCompletionRepository: (
    ctx: Context,
  ) => ReturnType<typeof createEventCompletionRepository>;
  plannedEventType: DbEventType;
  toCoreEventType: (eventType: DbEventType) => CoreEventType;
  toDateKey: (value: string) => string;
};

export async function deleteEventUseCase<
  TInput extends { id: string; scope?: EventMutationScope },
  TEventRecord extends EventRecord,
>(input: { ctx: ProtectedContext; input: TInput; dependencies: DeleteEventUseCaseDependencies }) {
  const { ctx, dependencies } = input;
  const completionRepository = dependencies.getEventCompletionRepository(ctx);
  const existing = await completionRepository.getOwnedEventForCompletion({
    eventId: input.input.id,
    profileId: ctx.session.user.id,
  });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Event not found",
    });
  }

  const existingEvent = existing as unknown as TEventRecord;
  const existingEventType = dependencies.toCoreEventType(existingEvent.event_type);
  if (existingEventType === "imported") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Imported events are read-only",
    });
  }

  const scope = input.input.scope ?? "single";

  try {
    const rowsToDelete = (await completionRepository.deleteOwnedEventsForScope({
      anchorEvent: existingEvent,
      profileId: ctx.session.user.id,
      scope,
      beforeDelete: async ({ candidates, tx }) => {
        const rows = candidates as TEventRecord[];
        const transactionPermissions = dependencies.getContentPermissions(ctx, tx);
        const plannedEventIds = rows
          .filter((row) => row.event_type === dependencies.plannedEventType && row.activity_plan_id)
          .map((row) => row.id);
        if (plannedEventIds.length > 0) {
          const result = await dependencies.enqueueProviderPlannedActivityJobs(ctx, {
            drainDueJobs: false,
            eventIds: plannedEventIds,
            operation: "unsync",
            transaction: tx,
          });
          if (result && !result.success)
            throw new Error(result.error ?? "Failed to enqueue unsync jobs");
        }
        if (transactionPermissions) {
          await Promise.all(rows.map((row) => transactionPermissions.revokeEventGrants(row.id)));
        }
      },
    })) as TEventRecord[];

    const result = {
      success: true,
      mutation_scope: scope,
      affected_count: rowsToDelete.length,
      affected_event_ids: rowsToDelete.map((row) => row.id),
      insight_refresh_hint: dependencies.buildInsightRefreshHint({
        trainingPlanId: existingEvent.training_plan_id,
        changedDate: dependencies.toDateKey(existingEvent.starts_at),
        changeAt: existingEvent.updated_at,
      }),
    };
    try {
      await drainDueWahooPlannedWorkoutJobs({
        db: getRequiredDb(ctx),
        limit: 3,
        workerId: "event-delete-planned-workout-drain",
      });
    } catch {
      logger.error("Failed to drain planned workout unsync jobs after event deletion", {
        category: "upstream",
        provider: "wahoo",
      });
    }
    return result;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Failed to delete events",
    });
  }
}
