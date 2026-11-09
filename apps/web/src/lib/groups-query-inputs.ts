export const GROUP_LIBRARY_PAGE_SIZE = 30;
export const GROUP_EVENT_PAGE_SIZE = 20;
export const GROUP_ROUTE_WINDOW_MS = 60_000;

export const groupLibraryTabs = [
  "upcoming",
  "joined",
  "owned",
  "discover",
  "invitations",
  "requests",
] as const;

export type GroupLibraryTab = (typeof groupLibraryTabs)[number];

export function isGroupLibraryTab(value: unknown): value is GroupLibraryTab {
  return typeof value === "string" && groupLibraryTabs.includes(value as GroupLibraryTab);
}

export function createGroupDetailInput(groupId: string) {
  return { groupId };
}

export function createGroupEventDetailInput(groupEventId: string) {
  return { groupEventId };
}

export function createMyGroupsInput() {
  return { limit: GROUP_LIBRARY_PAGE_SIZE };
}

export function createDiscoverableGroupsInput(search: string | undefined) {
  return { limit: GROUP_LIBRARY_PAGE_SIZE, search };
}

export function createMyInvitationsInput() {
  return { limit: GROUP_LIBRARY_PAGE_SIZE };
}

export function createMyJoinRequestsInput() {
  return { limit: GROUP_LIBRARY_PAGE_SIZE };
}

export function createUpcomingGroupEventsInput(startsAfter: string) {
  return { limit: GROUP_LIBRARY_PAGE_SIZE, startsAfter };
}

export function createGroupEventsAfterInput(groupId: string, startsAfter: string) {
  return { groupId, limit: GROUP_EVENT_PAGE_SIZE, startsAfter };
}

export function createGroupEventsBeforeInput(groupId: string, startsBefore: string) {
  return { groupId, limit: GROUP_EVENT_PAGE_SIZE, startsBefore };
}

export function createGroupMembersInput(groupId: string) {
  return { groupId, limit: GROUP_LIBRARY_PAGE_SIZE };
}

export function createPendingInvitationsInput(groupId: string) {
  return { groupId, limit: 50 };
}

export function createPendingJoinRequestsInput(groupId: string) {
  return { groupId, limit: 50 };
}

export function createGroupEventOccurrencesInput(groupEventId: string, startsAfter: string) {
  return { groupEventId, limit: GROUP_LIBRARY_PAGE_SIZE, startsAfter };
}

export function createRouteInput(routeId: string) {
  return { id: routeId };
}

export function createActivityPlansInput(activityPlanId: string | null | undefined) {
  return { ids: activityPlanId ? [activityPlanId] : [] };
}

export function getInfiniteQueryPageCount(cached: { pages: unknown[] } | undefined) {
  return Math.max(cached?.pages.length ?? 0, 1);
}

/**
 * Route preloads and navigations share a one-minute event-window snapshot. This
 * bounds the query-key clock drift without widening "upcoming" to a day: an
 * event from the preceding minute can remain until the next intentional bucket
 * rollover, at most 60 seconds later.
 */
export function getGroupRouteWindowStart(now: Date | number = Date.now()) {
  const timestamp = typeof now === "number" ? now : now.getTime();
  return new Date(
    Math.floor(timestamp / GROUP_ROUTE_WINDOW_MS) * GROUP_ROUTE_WINDOW_MS,
  ).toISOString();
}
