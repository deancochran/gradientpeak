import { invalidateSchedulingQueries, type SchedulingRefreshScope } from "@repo/api/client";
import { QueryClient } from "@tanstack/react-query";

export async function refreshScheduleViews(
  queryClient: QueryClient,
  scope: SchedulingRefreshScope = "eventMutation",
) {
  await invalidateSchedulingQueries(queryClient, scope);
}

export async function refreshScheduleWithCallbacks(input: {
  queryClient: QueryClient;
  scope?: SchedulingRefreshScope;
  callbacks?: Array<() => Promise<unknown> | unknown>;
}) {
  const { queryClient, scope = "eventMutation", callbacks = [] } = input;

  await Promise.all([
    refreshScheduleViews(queryClient, scope),
    ...callbacks.map((callback) => Promise.resolve(callback())),
  ]);
}

export async function refreshPlanTabData(input: {
  refetchActivePlan: () => Promise<unknown> | unknown;
  refetchSnapshot: () => Promise<unknown> | unknown;
  refetchGoals: () => Promise<unknown> | unknown;
  refetchUpcomingEvents: () => Promise<unknown> | unknown;
  refetchRecentEvents: () => Promise<unknown> | unknown;
}) {
  await Promise.all([
    input.refetchActivePlan(),
    input.refetchSnapshot(),
    input.refetchGoals(),
    input.refetchUpcomingEvents(),
    input.refetchRecentEvents(),
  ]);
}
