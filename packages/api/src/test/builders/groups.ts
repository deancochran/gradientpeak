import type {
  groupEventActivityPlans,
  groupEventRsvps,
  groupEvents,
  groupInvitations,
  groupJoinRequests,
  groupMemberships,
  groups,
} from "@repo/db";

export const GROUP_TEST_IDS = {
  viewerId: "11111111-1111-4111-8111-111111111111",
  groupId: "22222222-2222-4222-8222-222222222222",
  eventId: "33333333-3333-4333-8333-333333333333",
  optionId: "44444444-4444-4444-8444-444444444444",
  otherOptionId: "55555555-5555-4555-8555-555555555555",
  activityPlanId: "66666666-6666-4666-8666-666666666666",
  targetId: "33333333-3333-4333-8333-333333333333",
  invitationId: "44444444-4444-4444-8444-444444444444",
  joinRequestId: "55555555-5555-4555-8555-555555555555",
} as const;

export const GROUP_TEST_NOW = new Date("2026-05-21T12:00:00.000Z");

export function buildGroupRow(overrides: Partial<typeof groups.$inferSelect> = {}) {
  return {
    id: GROUP_TEST_IDS.groupId,
    created_by_profile_id: GROUP_TEST_IDS.viewerId,
    name: "Gradient Peak Club",
    slug: "gradient-peak-club",
    description: null,
    avatar_url: null,
    cover_url: null,
    access_level: "public",
    join_policy: "open",
    created_at: GROUP_TEST_NOW,
    updated_at: GROUP_TEST_NOW,
    deleted_at: null,
    ...overrides,
  } as typeof groups.$inferSelect;
}

export function buildGroupEventRow(overrides: Partial<typeof groupEvents.$inferSelect> = {}) {
  return {
    id: GROUP_TEST_IDS.eventId,
    group_id: GROUP_TEST_IDS.groupId,
    series_id: null,
    created_by_profile_id: GROUP_TEST_IDS.viewerId,
    title: "Saturday Ride",
    description: null,
    starts_at: GROUP_TEST_NOW,
    ends_at: new Date("2026-05-21T14:00:00.000Z"),
    timezone: "America/New_York",
    recurrence_rule: null,
    recurrence_timezone: null,
    occurrence_key: null,
    location_name: "Clubhouse",
    route_id: null,
    cancelled_at: null,
    created_at: GROUP_TEST_NOW,
    updated_at: GROUP_TEST_NOW,
    ...overrides,
  } as typeof groupEvents.$inferSelect;
}

export function buildGroupEventActivityPlanRow(
  overrides: Partial<typeof groupEventActivityPlans.$inferSelect> = {},
) {
  return {
    id: GROUP_TEST_IDS.optionId,
    group_event_id: GROUP_TEST_IDS.eventId,
    activity_plan_id: GROUP_TEST_IDS.activityPlanId,
    label: "A Group",
    sort_order: 0,
    created_at: GROUP_TEST_NOW,
    ...overrides,
  } as typeof groupEventActivityPlans.$inferSelect;
}

export function buildGroupEventRsvpRow(
  overrides: Partial<typeof groupEventRsvps.$inferSelect> = {},
) {
  return {
    group_event_id: GROUP_TEST_IDS.eventId,
    profile_id: GROUP_TEST_IDS.viewerId,
    status: "accepted",
    selected_group_event_activity_plan_id: GROUP_TEST_IDS.optionId,
    created_at: GROUP_TEST_NOW,
    updated_at: GROUP_TEST_NOW,
    ...overrides,
  } as typeof groupEventRsvps.$inferSelect;
}

export function buildGroupMembershipRow(
  overrides: Partial<typeof groupMemberships.$inferSelect> = {},
) {
  return {
    group_id: GROUP_TEST_IDS.groupId,
    profile_id: GROUP_TEST_IDS.viewerId,
    role: "owner",
    status: "active",
    created_at: GROUP_TEST_NOW,
    updated_at: GROUP_TEST_NOW,
    ...overrides,
  } as typeof groupMemberships.$inferSelect;
}

export function buildGroupInvitationRow(
  overrides: Partial<typeof groupInvitations.$inferSelect> = {},
) {
  return {
    id: GROUP_TEST_IDS.invitationId,
    group_id: GROUP_TEST_IDS.groupId,
    invited_profile_id: GROUP_TEST_IDS.viewerId,
    status: "pending",
    expires_at: null,
    created_at: GROUP_TEST_NOW,
    updated_at: GROUP_TEST_NOW,
    ...overrides,
  } as typeof groupInvitations.$inferSelect;
}

export function buildGroupJoinRequestRow(
  overrides: Partial<typeof groupJoinRequests.$inferSelect> = {},
) {
  return {
    id: GROUP_TEST_IDS.joinRequestId,
    group_id: GROUP_TEST_IDS.groupId,
    profile_id: GROUP_TEST_IDS.viewerId,
    status: "pending",
    reviewed_by_profile_id: null,
    reviewed_at: null,
    created_at: GROUP_TEST_NOW,
    updated_at: GROUP_TEST_NOW,
    ...overrides,
  } as typeof groupJoinRequests.$inferSelect;
}
