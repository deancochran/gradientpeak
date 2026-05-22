import { api } from "@/lib/api";

type GroupApiUtils = ReturnType<typeof api.useUtils>;

export async function invalidateGroupListQueries(utils: GroupApiUtils) {
  await Promise.all([
    utils.groups.listDiscoverable.invalidate(),
    utils.groups.myGroups.invalidate(),
    utils.groups.myInvitations.invalidate(),
  ]);
}

export async function invalidateGroupDetailQueries(
  utils: GroupApiUtils,
  input?: { groupId?: string | null; slug?: string | null },
) {
  await Promise.all([
    input?.groupId
      ? utils.groups.detail.invalidate({ groupId: input.groupId })
      : utils.groups.detail.invalidate(),
    input?.slug ? utils.groups.detail.invalidate({ slug: input.slug }) : Promise.resolve(),
    input?.groupId
      ? utils.groups.members.invalidate({ groupId: input.groupId })
      : utils.groups.members.invalidate(),
    input?.groupId
      ? utils.groups.pendingInvitations.invalidate({ groupId: input.groupId })
      : utils.groups.pendingInvitations.invalidate(),
    input?.groupId
      ? utils.groups.pendingJoinRequests.invalidate({ groupId: input.groupId })
      : utils.groups.pendingJoinRequests.invalidate(),
  ]);
}

export async function invalidateGroupMutationQueries(
  utils: GroupApiUtils,
  input?: { groupId?: string | null; slug?: string | null },
) {
  await Promise.all([
    invalidateGroupListQueries(utils),
    invalidateGroupDetailQueries(utils, input),
  ]);
}

export async function invalidateGroupEventQueries(
  utils: GroupApiUtils,
  input?: { groupEventId?: string | null; groupId?: string | null },
) {
  await Promise.all([
    input?.groupId
      ? utils.groups.events.list.invalidate({ groupId: input.groupId })
      : utils.groups.events.list.invalidate(),
    input?.groupEventId
      ? utils.groups.events.detail.invalidate({ groupEventId: input.groupEventId })
      : utils.groups.events.detail.invalidate(),
    utils.groups.events.seriesOccurrences.invalidate(),
    utils.groups.events.myCalendarGroupEvents.invalidate(),
    utils.groups.events.myUpcomingGroupEvents.invalidate(),
    input?.groupId
      ? utils.groups.events.currentEventPlanOptions.invalidate({ groupId: input.groupId })
      : utils.groups.events.currentEventPlanOptions.invalidate(),
  ]);
}

export async function invalidateGroupEventMutationQueries(
  utils: GroupApiUtils,
  input?: { groupEventId?: string | null; groupId?: string | null },
) {
  await Promise.all([
    invalidateGroupEventQueries(utils, input),
    input?.groupId
      ? invalidateGroupDetailQueries(utils, { groupId: input.groupId })
      : Promise.resolve(),
  ]);
}
