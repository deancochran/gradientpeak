import {
  invalidateSchedulingQueries,
  type SchedulingRefreshScope,
} from "@repo/trpc/client";
import { QueryClient } from "@tanstack/react-query";

export async function refreshScheduleViews(
  queryClient: QueryClient,
  scope: SchedulingRefreshScope = "eventMutation",
) {
  await invalidateSchedulingQueries(queryClient, scope);
}
