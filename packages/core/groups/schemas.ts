import { z } from "zod";
import {
  CONFIGURABLE_GROUP_JOIN_POLICIES,
  GROUP_ACCESS_LEVELS,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_EVENT_ACTIVITY_PLAN_LABEL_MAX_LENGTH,
  GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX,
  GROUP_EVENT_DEFAULT_TIMEZONE,
  GROUP_EVENT_DESCRIPTION_MAX_LENGTH,
  GROUP_EVENT_RSVP_STATUSES,
  GROUP_EVENT_SERIES_RSVP_STATUSES,
  GROUP_EVENT_TITLE_MAX_LENGTH,
  GROUP_INVITE_PROFILE_LIMIT_MAX,
  GROUP_JOIN_POLICIES,
  GROUP_JOIN_REQUEST_REVIEW_DECISIONS,
  GROUP_LIST_LIMIT_DEFAULT,
  GROUP_LIST_LIMIT_MAX,
  GROUP_LIST_SEARCH_MAX_LENGTH,
  GROUP_MANAGEABLE_MEMBERSHIP_ROLES,
  GROUP_NAME_MAX_LENGTH,
} from "./constants";

export const groupAccessLevelSchema = z.enum(GROUP_ACCESS_LEVELS);
export const groupJoinPolicySchema = z.enum(GROUP_JOIN_POLICIES);
const configurableGroupJoinPolicySchema = z.enum(CONFIGURABLE_GROUP_JOIN_POLICIES);
export const groupManageableMembershipRoleSchema = z.enum(GROUP_MANAGEABLE_MEMBERSHIP_ROLES);
export const groupJoinRequestReviewDecisionSchema = z.enum(GROUP_JOIN_REQUEST_REVIEW_DECISIONS);
export const groupEventRsvpStatusSchema = z.enum(GROUP_EVENT_RSVP_STATUSES);
export const groupEventSeriesRsvpStatusSchema = z.enum(GROUP_EVENT_SERIES_RSVP_STATUSES);

const groupIdSchema = z.string().uuid("Invalid group ID");
const profileIdSchema = z.string().uuid("Invalid profile ID");
const groupEventIdSchema = z.string().uuid("Invalid group event ID");
const activityPlanIdSchema = z.string().uuid("Invalid activity plan ID");
const groupEventActivityPlanIdSchema = z.string().uuid("Invalid group event activity plan ID");
const routeIdSchema = z.string().uuid("Invalid route ID");
const dateTimeSchema = z.string().datetime("Invalid datetime");
const timezoneSchema = z.string().trim().min(1, "Timezone is required");
const recurrenceRuleSchema = z.string().trim().min(1, "Recurrence rule is required");
const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Group name is required")
  .max(GROUP_NAME_MAX_LENGTH, "Group name is too long");
const groupDescriptionSchema = z
  .string()
  .trim()
  .max(GROUP_DESCRIPTION_MAX_LENGTH, "Group description is too long")
  .nullable()
  .optional();
const groupImageUrlSchema = z.string().url("Invalid image URL").nullable().optional();
const groupEventTitleSchema = z
  .string()
  .trim()
  .min(1, "Group event title is required")
  .max(GROUP_EVENT_TITLE_MAX_LENGTH, "Group event title is too long");
const groupEventDescriptionSchema = z
  .string()
  .trim()
  .max(GROUP_EVENT_DESCRIPTION_MAX_LENGTH, "Group event description is too long")
  .nullable()
  .optional();
const groupEventActivityPlanOptionSchema = z.object({
  activityPlanId: activityPlanIdSchema,
  label: z
    .string()
    .trim()
    .min(1, "Group event activity plan label is required")
    .max(GROUP_EVENT_ACTIVITY_PLAN_LABEL_MAX_LENGTH, "Group event activity plan label is too long")
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const oneOffGroupEventTimeWindowSchema = <Schema extends z.ZodType>(schema: Schema) =>
  schema.refine(
    (value) => {
      const input = value as { startsAt?: string; endsAt?: string | null };
      return (
        !input.startsAt || !input.endsAt || Date.parse(input.endsAt) > Date.parse(input.startsAt)
      );
    },
    { message: "Group event end time must be after start time", path: ["endsAt"] },
  );

export const createGroupInputSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
  avatar_url: groupImageUrlSchema,
  cover_url: groupImageUrlSchema,
  access_level: groupAccessLevelSchema.default("public"),
  join_policy: configurableGroupJoinPolicySchema.default("open"),
});
export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;

export const updateGroupInputSchema = z
  .object({
    groupId: groupIdSchema,
    name: groupNameSchema.optional(),
    description: groupDescriptionSchema,
    avatar_url: groupImageUrlSchema,
    cover_url: groupImageUrlSchema,
    access_level: groupAccessLevelSchema.optional(),
    join_policy: configurableGroupJoinPolicySchema.optional(),
  })
  .refine(
    ({ groupId: _groupId, ...editableFields }) =>
      Object.values(editableFields).some((value) => value !== undefined),
    "At least one group field must be provided",
  );
export type UpdateGroupInput = z.infer<typeof updateGroupInputSchema>;

export const listGroupsInputSchema = z.object({
  search: z.string().trim().max(GROUP_LIST_SEARCH_MAX_LENGTH).optional(),
  cursor: z.string().min(1).nullable().optional(),
  limit: z.number().int().min(1).max(GROUP_LIST_LIMIT_MAX).default(GROUP_LIST_LIMIT_DEFAULT),
});
export type ListGroupsInput = z.infer<typeof listGroupsInputSchema>;

export const inviteProfilesInputSchema = z.object({
  groupId: groupIdSchema,
  profileIds: z.array(profileIdSchema).min(1).max(GROUP_INVITE_PROFILE_LIMIT_MAX),
});
export type InviteProfilesInput = z.infer<typeof inviteProfilesInputSchema>;

export const reviewJoinRequestInputSchema = z.object({
  requestId: z.string().uuid("Invalid join request ID"),
  decision: groupJoinRequestReviewDecisionSchema,
});
export type ReviewJoinRequestInput = z.infer<typeof reviewJoinRequestInputSchema>;

export const updateMemberRoleInputSchema = z.object({
  groupId: groupIdSchema,
  profileId: profileIdSchema,
  role: groupManageableMembershipRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;

export const removeMemberInputSchema = z.object({
  groupId: groupIdSchema,
  profileId: profileIdSchema,
});
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;

export const transferOwnershipInputSchema = z.object({
  groupId: groupIdSchema,
  targetProfileId: profileIdSchema,
  previousOwnerRole: groupManageableMembershipRoleSchema,
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInputSchema>;

export const createOneOffGroupEventInputSchema = oneOffGroupEventTimeWindowSchema(
  z.object({
    groupId: groupIdSchema,
    title: groupEventTitleSchema,
    description: groupEventDescriptionSchema,
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema.nullable().optional(),
    timezone: timezoneSchema.nullable().optional(),
    locationName: z.string().trim().min(1).nullable().optional(),
    routeId: routeIdSchema.nullable().optional(),
    activityPlans: z
      .array(groupEventActivityPlanOptionSchema)
      .max(GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX)
      .optional(),
  }),
);
export type CreateOneOffGroupEventInput = z.infer<typeof createOneOffGroupEventInputSchema>;

export const updateOneOffGroupEventInputSchema = oneOffGroupEventTimeWindowSchema(
  z
    .object({
      groupEventId: groupEventIdSchema,
      title: groupEventTitleSchema.optional(),
      description: groupEventDescriptionSchema,
      startsAt: dateTimeSchema.optional(),
      endsAt: dateTimeSchema.nullable().optional(),
      timezone: timezoneSchema.nullable().optional(),
      locationName: z.string().trim().min(1).nullable().optional(),
      routeId: routeIdSchema.nullable().optional(),
      cancelledAt: dateTimeSchema.nullable().optional(),
      activityPlans: z
        .array(groupEventActivityPlanOptionSchema)
        .max(GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX)
        .optional(),
    })
    .refine(
      ({ groupEventId: _groupEventId, ...editableFields }) =>
        Object.values(editableFields).some((value) => value !== undefined),
      "At least one group event field must be provided",
    ),
);
export type UpdateOneOffGroupEventInput = z.infer<typeof updateOneOffGroupEventInputSchema>;

export const listOneOffGroupEventsInputSchema = z.object({
  groupId: groupIdSchema,
  startsAfter: dateTimeSchema.optional(),
  startsBefore: dateTimeSchema.optional(),
  includeCancelled: z.boolean().default(false),
  cursor: z.string().min(1).nullable().optional(),
  limit: z.number().int().min(1).max(GROUP_LIST_LIMIT_MAX).default(GROUP_LIST_LIMIT_DEFAULT),
});
export type ListOneOffGroupEventsInput = z.infer<typeof listOneOffGroupEventsInputSchema>;

export const rsvpOneOffGroupEventInputSchema = z.object({
  groupEventId: groupEventIdSchema,
  status: groupEventRsvpStatusSchema,
  selectedGroupEventActivityPlanId: groupEventActivityPlanIdSchema.nullable().optional(),
});
export type RsvpOneOffGroupEventInput = z.infer<typeof rsvpOneOffGroupEventInputSchema>;

export const createRecurringEventSeriesInputSchema = oneOffGroupEventTimeWindowSchema(
  z.object({
    groupId: groupIdSchema,
    title: groupEventTitleSchema,
    description: groupEventDescriptionSchema,
    recurrenceRule: recurrenceRuleSchema,
    recurrenceTimezone: timezoneSchema.nullable().optional(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema.nullable().optional(),
    timezone: timezoneSchema,
    locationName: z.string().trim().min(1).nullable().optional(),
    routeId: routeIdSchema.nullable().optional(),
    generateOccurrencesStartsAt: dateTimeSchema.optional(),
    generateOccurrencesEndsAt: dateTimeSchema.optional(),
    activityPlans: z
      .array(groupEventActivityPlanOptionSchema)
      .max(GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX)
      .optional(),
  }),
);
export type CreateRecurringEventSeriesInput = z.infer<typeof createRecurringEventSeriesInputSchema>;

export const updateEventOccurrenceInputSchema = oneOffGroupEventTimeWindowSchema(
  z
    .object({
      groupEventId: groupEventIdSchema,
      title: groupEventTitleSchema.nullable().optional(),
      description: groupEventDescriptionSchema,
      startsAt: dateTimeSchema.optional(),
      endsAt: dateTimeSchema.nullable().optional(),
      timezone: timezoneSchema.nullable().optional(),
      locationName: z.string().trim().min(1).nullable().optional(),
      routeId: routeIdSchema.nullable().optional(),
      cancelledAt: dateTimeSchema.nullable().optional(),
    })
    .refine(
      ({ groupEventId: _groupEventId, ...editableFields }) =>
        Object.values(editableFields).some((value) => value !== undefined),
      "At least one group event occurrence field must be provided",
    ),
);
export type UpdateEventOccurrenceInput = z.infer<typeof updateEventOccurrenceInputSchema>;

export const rsvpEventSeriesInputSchema = z.object({
  groupEventSeriesId: groupEventIdSchema,
  status: groupEventSeriesRsvpStatusSchema,
});
export type RsvpEventSeriesInput = z.infer<typeof rsvpEventSeriesInputSchema>;

export const copySeriesActivityPlansToOccurrenceInputSchema = z.object({
  groupEventSeriesId: groupEventIdSchema,
  groupEventOccurrenceId: groupEventIdSchema,
});
export type CopySeriesActivityPlansToOccurrenceInput = z.infer<
  typeof copySeriesActivityPlansToOccurrenceInputSchema
>;

export type GroupEventFallbackFields = {
  title: string | null;
  description?: string | null;
  timezone?: string | null;
  locationName?: string | null;
  routeId?: string | null;
};

export const resolveGroupEventFallbackFields = <Occurrence extends GroupEventFallbackFields>(
  occurrence: Occurrence,
  series?: GroupEventFallbackFields | null,
) => ({
  title: occurrence.title ?? series?.title ?? null,
  description: occurrence.description ?? series?.description ?? null,
  timezone: occurrence.timezone ?? series?.timezone ?? GROUP_EVENT_DEFAULT_TIMEZONE,
  locationName: occurrence.locationName ?? series?.locationName ?? null,
  routeId: occurrence.routeId ?? series?.routeId ?? null,
});
