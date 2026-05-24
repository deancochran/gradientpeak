import { useMemo } from "react";
import { api } from "@/lib/api";

const GROUP_DETAIL_PAGE_SIZE = 50;

type UseGroupDetailViewModelOptions =
  | { groupId: string; includeAdminQueues?: boolean; slug?: never }
  | { groupId?: never; includeAdminQueues?: boolean; slug: string }
  | { groupId?: null; includeAdminQueues?: boolean; slug?: null };

export function useGroupDetailViewModel(input: UseGroupDetailViewModelOptions) {
  const enabled = Boolean(input.groupId || input.slug);
  const includeAdminQueues = input.includeAdminQueues ?? false;
  const detailQuery = api.groups.detail.useQuery(
    input.groupId ? { groupId: input.groupId } : { slug: input.slug ?? "" },
    {
      enabled,
    },
  );
  const groupId = detailQuery.data?.group.id ?? null;
  const viewer = detailQuery.data?.viewer ?? null;
  const hasResolvedGroup = Boolean(detailQuery.isSuccess && groupId);
  const canViewMembers = Boolean(hasResolvedGroup && viewer?.canViewMembers);
  const canManageInvitations = Boolean(includeAdminQueues && hasResolvedGroup && viewer?.canInvite);
  const canManageJoinRequests = Boolean(
    includeAdminQueues && hasResolvedGroup && viewer?.canManageJoinRequests,
  );

  const membersQuery = api.groups.members.useInfiniteQuery(
    { groupId: groupId ?? "", limit: GROUP_DETAIL_PAGE_SIZE },
    {
      enabled: canViewMembers,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const invitationsQuery = api.groups.pendingInvitations.useInfiniteQuery(
    { groupId: groupId ?? "", limit: GROUP_DETAIL_PAGE_SIZE },
    {
      enabled: canManageInvitations,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const joinRequestsQuery = api.groups.pendingJoinRequests.useInfiniteQuery(
    { groupId: groupId ?? "", limit: GROUP_DETAIL_PAGE_SIZE },
    {
      enabled: canManageJoinRequests,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const currentEventPlanOptionsQuery = api.groups.events.currentEventPlanOptions.useQuery(
    { groupId: groupId ?? "" },
    { enabled: Boolean(hasResolvedGroup && viewer?.canViewGroupEvents) },
  );

  const members = useMemo(
    () => membersQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [membersQuery.data],
  );
  const invitations = useMemo(
    () => invitationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [invitationsQuery.data],
  );
  const joinRequests = useMemo(
    () => joinRequestsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [joinRequestsQuery.data],
  );

  return {
    group: detailQuery.data?.group ?? null,
    viewer,
    groupId,
    detailQuery,
    members,
    membersQuery,
    invitations,
    invitationsQuery,
    joinRequests,
    joinRequestsQuery,
    currentEventPlanOptions: currentEventPlanOptionsQuery.data ?? null,
    currentEventPlanOptionsQuery,
    isLoading: detailQuery.isLoading,
    isError: detailQuery.isError,
    error: detailQuery.error,
    refetch: detailQuery.refetch,
  };
}
