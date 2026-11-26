import { invalidateSchedulingQueries, type SchedulingRefreshScope } from "@repo/api/client";
import type { QueryClient } from "@tanstack/react-query";

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
