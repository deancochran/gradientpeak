import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import { createQueryClient } from "./query-client";
import type { AppRouter } from "./routers";

type BatchLinkOptions = Parameters<typeof httpBatchLink<AppRouter>>[0];

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("api/trpc", normalizedBaseUrl).toString();
}

export function createTRPCBatchLink(options: {
  url: string;
  fetch?: BatchLinkOptions["fetch"];
  headers?: BatchLinkOptions["headers"];
}) {
  return httpBatchLink<AppRouter>({
    transformer: superjson,
    ...options,
  });
}

export function createTRPCReactClient(options: {
  url: string;
  fetch?: BatchLinkOptions["fetch"];
  headers?: BatchLinkOptions["headers"];
}) {
  return trpc.createClient({
    links: [createTRPCBatchLink(options)],
  });
}

export function createVanillaTRPCClient(options: {
  url: string;
  fetch?: BatchLinkOptions["fetch"];
  headers?: BatchLinkOptions["headers"];
}) {
  return createTRPCProxyClient<AppRouter>({
    links: [createTRPCBatchLink(options)],
  });
}

export type TRPCReactUtils = ReturnType<typeof trpc.useUtils>;

export async function invalidateNotificationQueries(utils: TRPCReactUtils) {
  await Promise.all([
    utils.notifications.getRecent.invalidate(),
    utils.notifications.getUnreadCount.invalidate(),
  ]);
}

export async function invalidateMessagingInboxQueries(utils: TRPCReactUtils) {
  await Promise.all([
    utils.messaging.getConversations.invalidate(),
    utils.messaging.getUnreadCount.invalidate(),
  ]);
}

export async function invalidateConversationQueries(utils: TRPCReactUtils, conversationId: string) {
  await Promise.all([
    utils.messaging.getMessages.invalidate({ conversation_id: conversationId }),
    invalidateMessagingInboxQueries(utils),
  ]);
}

export async function invalidateRelationshipQueries(
  utils: TRPCReactUtils,
  userIds: readonly (string | null | undefined)[],
) {
  const uniqueUserIds = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];

  if (uniqueUserIds.length === 0) {
    return;
  }

  await Promise.all(
    uniqueUserIds.flatMap((userId) => [
      utils.profiles.getPublicById.invalidate({ id: userId }),
      utils.social.getFollowers.invalidate({ user_id: userId }),
      utils.social.getFollowing.invalidate({ user_id: userId }),
    ]),
  );
}

export async function invalidateGoalQueries(
  utils: TRPCReactUtils,
  options: {
    goalId?: string | null;
    includeGoalDetail?: boolean;
    includeEventDetail?: boolean;
  } = {},
) {
  const refreshTasks: Promise<unknown>[] = [
    utils.goals.list.invalidate(),
    utils.events.list.invalidate(),
  ];

  if (options.includeGoalDetail !== false && options.goalId) {
    refreshTasks.push(utils.goals.getById.invalidate({ id: options.goalId }));
  }

  if (options.includeEventDetail) {
    refreshTasks.push(utils.events.getById.invalidate());
  }

  await Promise.all(refreshTasks);
}

export async function invalidateActivityPlanQueries(
  utils: TRPCReactUtils,
  options: {
    planId?: string | null;
    includeCount?: boolean;
    includeDetail?: boolean;
  } = {},
) {
  const refreshTasks: Promise<unknown>[] = [utils.activityPlans.list.invalidate()];

  if (options.includeCount !== false) {
    refreshTasks.push(utils.activityPlans.getUserPlansCount.invalidate());
  }

  if (options.includeDetail && options.planId) {
    refreshTasks.push(utils.activityPlans.getById.invalidate({ id: options.planId }));
  }

  await Promise.all(refreshTasks);
}

export async function invalidateTrainingPlanQueries(utils: TRPCReactUtils) {
  await utils.trainingPlans.invalidate();
}

export type { AppRouter };
export { createQueryClient };
