import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type { createEventCompletionRepository } from "../../infrastructure/repositories";
import type { PlannedWorkoutQueueResult } from "../../lib/provider-sync/planned-workouts";
import type { createContentAccessPermissions } from "../../permissions/content-access";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "planned" | "rest_day" | "race_target" | "custom" | "imported";
type DbEventType = "planned_activity" | "rest_day" | "race" | "custom" | "imported";
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
    input: { eventIds: string[]; operation: "publish" | "unsync"; profileId?: string },
  ) => Promise<PlannedWorkoutQueueResult | null>;
  getContentPermissions: (ctx: Context) => ContentPermissions;
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
  const permissions = dependencies.getContentPermissions(ctx);
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

  let rowsToDelete: TEventRecord[];
  try {
    rowsToDelete = (await completionRepository.listOwnedEventsForDeleteScope({
      anchorEvent: existingEvent,
      profileId: ctx.session.user.id,
      scope,
    })) as TEventRecord[];
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Failed to scope events for delete",
    });
  }

  try {
    const plannedEventIds = rowsToDelete
      .filter((row) => row.event_type === dependencies.plannedEventType && row.activity_plan_id)
      .map((row) => row.id);

    if (plannedEventIds.length > 0) {
      await dependencies.enqueueProviderPlannedActivityJobs(ctx, {
        eventIds: plannedEventIds,
        operation: "unsync",
      });
    }
  } catch (error) {
    console.error("Failed to enqueue planned workout unsync jobs:", error);
  }

  try {
    await completionRepository.deleteOwnedEventsForScope({
      anchorEvent: existingEvent,
      profileId: ctx.session.user.id,
      scope,
    });

    if (permissions) {
      await Promise.all(rowsToDelete.map((row) => permissions.revokeEventGrants(row.id)));
    }
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Failed to delete events",
    });
  }

  return {
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
}
