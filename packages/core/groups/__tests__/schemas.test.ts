import { describe, expect, it } from "vitest";
import {
  GROUP_ACCESS_LEVELS,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX,
  GROUP_EVENT_DESCRIPTION_MAX_LENGTH,
  GROUP_EVENT_RSVP_STATUSES,
  GROUP_EVENT_TITLE_MAX_LENGTH,
  GROUP_JOIN_POLICIES,
  GROUP_JOIN_REQUEST_REVIEW_DECISIONS,
  GROUP_LIST_LIMIT_DEFAULT,
  GROUP_LIST_LIMIT_MAX,
  GROUP_MANAGEABLE_MEMBERSHIP_ROLES,
  GROUP_NAME_MAX_LENGTH,
} from "../constants";
import {
  copySeriesActivityPlansToOccurrenceInputSchema,
  createGroupInputSchema,
  createOneOffGroupEventInputSchema,
  createRecurringEventSeriesInputSchema,
  inviteProfilesInputSchema,
  listGroupsInputSchema,
  listOneOffGroupEventsInputSchema,
  resolveGroupEventFallbackFields,
  reviewJoinRequestInputSchema,
  rsvpEventSeriesInputSchema,
  rsvpOneOffGroupEventInputSchema,
  transferOwnershipInputSchema,
  updateEventOccurrenceInputSchema,
  updateGroupInputSchema,
  updateMemberRoleInputSchema,
  updateOneOffGroupEventInputSchema,
} from "../schemas";

const validGroupId = "00000000-0000-4000-8000-000000000001";
const validProfileId = "00000000-0000-4000-8000-000000000002";
const otherValidProfileId = "00000000-0000-4000-8000-000000000003";
const validGroupEventId = "00000000-0000-4000-8000-000000000004";
const validActivityPlanId = "00000000-0000-4000-8000-000000000005";
const validGroupEventActivityPlanId = "00000000-0000-4000-8000-000000000006";
const validRouteId = "00000000-0000-4000-8000-000000000007";
const [publicAccessLevel, membersOnlyAccessLevel] = GROUP_ACCESS_LEVELS;
const [openJoinPolicy, requestToJoinPolicy, inviteOnlyJoinPolicy] = GROUP_JOIN_POLICIES;
const [adminRole, memberRole] = GROUP_MANAGEABLE_MEMBERSHIP_ROLES;
const [approveDecision] = GROUP_JOIN_REQUEST_REVIEW_DECISIONS;
const [acceptedRsvpStatus, declinedRsvpStatus] = GROUP_EVENT_RSVP_STATUSES;

describe("group input schemas", () => {
  it("normalizes create input and applies MVP defaults", () => {
    expect(
      createGroupInputSchema.parse({
        name: "  Morning Riders  ",
        description: "  Social endurance rides  ",
      }),
    ).toEqual({
      name: "Morning Riders",
      description: "Social endurance rides",
      access_level: publicAccessLevel,
      join_policy: openJoinPolicy,
    });
  });

  it("enforces group name and description length limits", () => {
    expect(
      createGroupInputSchema.safeParse({ name: "x".repeat(GROUP_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      createGroupInputSchema.safeParse({ name: "x".repeat(GROUP_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(
      createGroupInputSchema.safeParse({
        name: "Valid group",
        description: "x".repeat(GROUP_DESCRIPTION_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("requires update input to include at least one editable field", () => {
    expect(updateGroupInputSchema.safeParse({ groupId: validGroupId }).success).toBe(false);
    expect(
      updateGroupInputSchema.safeParse({
        groupId: validGroupId,
        access_level: membersOnlyAccessLevel,
        join_policy: inviteOnlyJoinPolicy,
      }).success,
    ).toBe(true);
    expect(
      updateGroupInputSchema.safeParse({
        groupId: validGroupId,
        join_policy: requestToJoinPolicy,
      }).success,
    ).toBe(false);
  });

  it("validates list pagination defaults and limits", () => {
    expect(listGroupsInputSchema.parse({})).toEqual({ limit: GROUP_LIST_LIMIT_DEFAULT });
    expect(listGroupsInputSchema.safeParse({ limit: GROUP_LIST_LIMIT_MAX + 1 }).success).toBe(
      false,
    );
  });

  it("validates invite profile batches", () => {
    expect(
      inviteProfilesInputSchema.parse({
        groupId: validGroupId,
        profileIds: [validProfileId, otherValidProfileId],
      }),
    ).toEqual({
      groupId: validGroupId,
      profileIds: [validProfileId, otherValidProfileId],
    });
    expect(
      inviteProfilesInputSchema.safeParse({ groupId: validGroupId, profileIds: [] }).success,
    ).toBe(false);
  });

  it("validates join request review, role update, and ownership transfer inputs", () => {
    expect(
      reviewJoinRequestInputSchema.safeParse({ requestId: validGroupId, decision: approveDecision })
        .success,
    ).toBe(true);
    expect(
      updateMemberRoleInputSchema.safeParse({
        groupId: validGroupId,
        profileId: validProfileId,
        role: adminRole,
      }).success,
    ).toBe(true);
    expect(
      transferOwnershipInputSchema.safeParse({
        groupId: validGroupId,
        targetProfileId: validProfileId,
        previousOwnerRole: memberRole,
      }).success,
    ).toBe(true);
  });
});

describe("recurring group event input schemas", () => {
  it("normalizes recurring series create input", () => {
    expect(
      createRecurringEventSeriesInputSchema.parse({
        groupId: validGroupId,
        title: "  Saturday Club Ride  ",
        recurrenceRule: "  FREQ=WEEKLY;BYDAY=SA  ",
        recurrenceTimezone: "  America/New_York  ",
        startsAt: "2026-06-06T14:00:00.000Z",
        timezone: "  America/New_York  ",
        activityPlans: [{ activityPlanId: validActivityPlanId }],
      }),
    ).toMatchObject({
      groupId: validGroupId,
      title: "Saturday Club Ride",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=SA",
      recurrenceTimezone: "America/New_York",
      startsAt: "2026-06-06T14:00:00.000Z",
      timezone: "America/New_York",
    });
  });

  it("validates recurrence rule, timezone, occurrence overrides, RSVP, and copy contracts", () => {
    expect(
      createRecurringEventSeriesInputSchema.safeParse({
        groupId: validGroupId,
        title: "Saturday Club Ride",
        recurrenceRule: " ",
        startsAt: "2026-06-06T14:00:00.000Z",
        timezone: "America/New_York",
      }).success,
    ).toBe(false);
    expect(
      updateEventOccurrenceInputSchema.safeParse({
        groupEventId: validGroupEventId,
        title: null,
        description: null,
        timezone: null,
        routeId: null,
      }).success,
    ).toBe(true);
    expect(
      updateEventOccurrenceInputSchema.safeParse({ groupEventId: validGroupEventId }).success,
    ).toBe(false);
    expect(
      rsvpEventSeriesInputSchema.parse({
        groupEventSeriesId: validGroupEventId,
        status: acceptedRsvpStatus,
      }),
    ).toEqual({ groupEventSeriesId: validGroupEventId, status: acceptedRsvpStatus });
    expect(
      copySeriesActivityPlansToOccurrenceInputSchema.safeParse({
        groupEventSeriesId: validGroupEventId,
        groupEventOccurrenceId: "00000000-0000-4000-8000-000000000008",
      }).success,
    ).toBe(true);
  });

  it("resolves occurrence display fields from series fallback", () => {
    expect(
      resolveGroupEventFallbackFields(
        { title: null, description: null, timezone: null, locationName: "Park", routeId: null },
        {
          title: "Series",
          description: "Default",
          timezone: "America/New_York",
          routeId: validRouteId,
        },
      ),
    ).toEqual({
      title: "Series",
      description: "Default",
      timezone: "America/New_York",
      locationName: "Park",
      routeId: validRouteId,
    });
  });
});

describe("one-off group event input schemas", () => {
  it("normalizes create input with optional one-off event fields and activity plans", () => {
    expect(
      createOneOffGroupEventInputSchema.parse({
        groupId: validGroupId,
        title: "  Saturday Ride  ",
        description: "  Endurance group ride  ",
        startsAt: "2026-06-06T14:00:00.000Z",
        endsAt: "2026-06-06T16:00:00.000Z",
        timezone: "  America/New_York  ",
        locationName: "  Clubhouse  ",
        routeId: validRouteId,
        activityPlans: [
          {
            activityPlanId: validActivityPlanId,
            label: "  A group  ",
            sortOrder: 1,
          },
        ],
      }),
    ).toEqual({
      groupId: validGroupId,
      title: "Saturday Ride",
      description: "Endurance group ride",
      startsAt: "2026-06-06T14:00:00.000Z",
      endsAt: "2026-06-06T16:00:00.000Z",
      timezone: "America/New_York",
      locationName: "Clubhouse",
      routeId: validRouteId,
      activityPlans: [
        {
          activityPlanId: validActivityPlanId,
          label: "A group",
          sortOrder: 1,
        },
      ],
    });
  });

  it("enforces one-off event title, description, time window, and option limits", () => {
    expect(
      createOneOffGroupEventInputSchema.safeParse({
        groupId: validGroupId,
        title: "x".repeat(GROUP_EVENT_TITLE_MAX_LENGTH),
        description: "x".repeat(GROUP_EVENT_DESCRIPTION_MAX_LENGTH),
        startsAt: "2026-06-06T14:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      createOneOffGroupEventInputSchema.safeParse({
        groupId: validGroupId,
        title: "x".repeat(GROUP_EVENT_TITLE_MAX_LENGTH + 1),
        startsAt: "2026-06-06T14:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      createOneOffGroupEventInputSchema.safeParse({
        groupId: validGroupId,
        title: "Saturday Ride",
        description: "x".repeat(GROUP_EVENT_DESCRIPTION_MAX_LENGTH + 1),
        startsAt: "2026-06-06T14:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      createOneOffGroupEventInputSchema.safeParse({
        groupId: validGroupId,
        title: "Saturday Ride",
        startsAt: "2026-06-06T14:00:00.000Z",
        endsAt: "2026-06-06T13:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      createOneOffGroupEventInputSchema.safeParse({
        groupId: validGroupId,
        title: "Saturday Ride",
        startsAt: "2026-06-06T14:00:00.000Z",
        activityPlans: Array.from(
          { length: GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX + 1 },
          () => ({
            activityPlanId: validActivityPlanId,
          }),
        ),
      }).success,
    ).toBe(false);
  });

  it("validates update, list, and RSVP contracts", () => {
    expect(
      updateOneOffGroupEventInputSchema.safeParse({ groupEventId: validGroupEventId }).success,
    ).toBe(false);
    expect(
      updateOneOffGroupEventInputSchema.safeParse({
        groupEventId: validGroupEventId,
        title: "Updated Ride",
        cancelledAt: null,
      }).success,
    ).toBe(true);
    expect(listOneOffGroupEventsInputSchema.parse({ groupId: validGroupId })).toEqual({
      groupId: validGroupId,
      includeCancelled: false,
      limit: GROUP_LIST_LIMIT_DEFAULT,
    });
    expect(
      rsvpOneOffGroupEventInputSchema.parse({
        groupEventId: validGroupEventId,
        status: acceptedRsvpStatus,
        selectedGroupEventActivityPlanId: validGroupEventActivityPlanId,
      }),
    ).toEqual({
      groupEventId: validGroupEventId,
      status: acceptedRsvpStatus,
      selectedGroupEventActivityPlanId: validGroupEventActivityPlanId,
    });
    expect(
      rsvpOneOffGroupEventInputSchema.safeParse({
        groupEventId: validGroupEventId,
        status: declinedRsvpStatus,
        selectedGroupEventActivityPlanId: null,
      }).success,
    ).toBe(true);
  });
});
