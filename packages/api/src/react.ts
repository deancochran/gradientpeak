import { useQueryClient } from "@tanstack/react-query";
import { createTRPCProxyClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";

export { loggerLink } from "@trpc/client";

import superjson from "superjson";
import { isPlannedSessionConflict } from "./planned-session-client";
import { createQueryClient, invalidateReceiptCacheTags } from "./query-client";
import type { AppRouter } from "./routers";

type BatchLinkOptions = Parameters<typeof httpBatchLink<AppRouter>>[0];

export const api = createTRPCReact<AppRouter>();

export function createApiUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("api/trpc", normalizedBaseUrl).toString();
}

export function createApiBatchLink(options: {
  url: string;
  fetch?: BatchLinkOptions["fetch"];
  headers?: BatchLinkOptions["headers"];
}) {
  return httpBatchLink<AppRouter>({
    transformer: superjson,
    url: options.url,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  });
}

export function createApiReactClient(options: {
  url: string;
  fetch?: BatchLinkOptions["fetch"];
  headers?: BatchLinkOptions["headers"];
}) {
  return api.createClient({
    links: [createApiBatchLink(options)],
  });
}

export function createVanillaApiClient(options: {
  url: string;
  fetch?: BatchLinkOptions["fetch"];
  headers?: BatchLinkOptions["headers"];
}) {
  return createTRPCProxyClient<AppRouter>({
    links: [createApiBatchLink(options)],
  });
}

export type ApiReactUtils = ReturnType<typeof api.useUtils>;
type CacheReceipt = Parameters<typeof invalidateReceiptCacheTags>[1];

/**
 * Shared receipt-aware planned-session actions for web and mobile.
 * Conflict callers supply a range refetch and never manufacture a newer revision locally.
 */
export function usePlannedSessionMutations(options: {
  onConflict: () => Promise<unknown>;
  onReceipt?: () => Promise<unknown> | unknown;
}) {
  const queryClient = useQueryClient();
  const mutationOptions = {
    retry: false as const,
    onSuccess: async (receipt: CacheReceipt) => {
      await invalidateReceiptCacheTags(queryClient, receipt);
      await options.onReceipt?.();
    },
    onError: async (error: unknown) => {
      if (isPlannedSessionConflict(error)) await options.onConflict();
    },
  };

  return {
    create: api.plannedSessions.create.useMutation(mutationOptions),
    move: api.plannedSessions.move.useMutation(mutationOptions),
    changePlanOnly: api.plannedSessions.changePlanOnly.useMutation(mutationOptions),
    cancel: api.plannedSessions.cancel.useMutation(mutationOptions),
    linkCompletion: api.plannedSessions.linkCompletion.useMutation(mutationOptions),
    linkGroupEvent: api.plannedSessions.linkGroupEvent.useMutation(mutationOptions),
    unlinkGroupEvent: api.plannedSessions.unlinkGroupEvent.useMutation(mutationOptions),
  };
}
export async function invalidateNotificationQueries(utils: ApiReactUtils) {
  await Promise.all([
    utils.notifications.getRecent.invalidate(),
    utils.notifications.getUnreadCount.invalidate(),
  ]);
}

export async function invalidateMessagingInboxQueries(utils: ApiReactUtils) {
  await Promise.all([
    utils.messaging.getConversations.invalidate(),
    utils.messaging.getUnreadCount.invalidate(),
  ]);
}

export async function invalidateConversationQueries(utils: ApiReactUtils, conversationId: string) {
  await Promise.all([
    utils.messaging.getMessages.invalidate({ conversation_id: conversationId }),
    invalidateMessagingInboxQueries(utils),
  ]);
}

export async function invalidateRelationshipQueries(
  utils: ApiReactUtils,
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
  utils: ApiReactUtils,
  options: {
    goalId?: string | null;
    includeGoalDetail?: boolean;
  } = {},
) {
  const refreshTasks: Promise<unknown>[] = [utils.goals.list.invalidate()];

  if (options.includeGoalDetail !== false && options.goalId) {
    refreshTasks.push(utils.goals.getById.invalidate({ id: options.goalId }));
  }
  if (options.goalId) {
    refreshTasks.push(
      utils.athleteIntelligence.getGoalAssessment.invalidate({ goalId: options.goalId }),
      utils.athleteIntelligence.getGoalProgress.invalidate({ goalId: options.goalId }),
    );
  }
  refreshTasks.push(utils.athleteIntelligence.getGoalAssessmentBatch.invalidate());

  await Promise.all(refreshTasks);
}

export async function invalidateActivityPlanQueries(
  utils: ApiReactUtils,
  options: {
    planId?: string | null;
    includeDetail?: boolean;
  } = {},
) {
  const refreshTasks: Promise<unknown>[] = [utils.activityPlans.list.invalidate()];

  if (options.includeDetail && options.planId) {
    refreshTasks.push(
      utils.activityPlans.getById.invalidate({ id: options.planId, personalize: false }),
      utils.activityPlans.getById.invalidate({ id: options.planId, personalize: true }),
    );
  }

  await Promise.all(refreshTasks);
}

export async function invalidateTrainingPlanQueries(utils: ApiReactUtils) {
  await utils.trainingPlans.invalidate();
}

export type { AppRouter, TRPCLink };
export { createQueryClient };
