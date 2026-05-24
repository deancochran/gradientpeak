export const GROUP_ACCESS_LEVELS = ["public", "members_only"] as const;
export type GroupAccessLevel = (typeof GROUP_ACCESS_LEVELS)[number];

export const GROUP_JOIN_POLICIES = ["open", "request_to_join", "invite_only"] as const;
export type GroupJoinPolicy = (typeof GROUP_JOIN_POLICIES)[number];

export const CONFIGURABLE_GROUP_JOIN_POLICIES = ["open", "invite_only"] as const;
export type ConfigurableGroupJoinPolicy = (typeof CONFIGURABLE_GROUP_JOIN_POLICIES)[number];

export const GROUP_MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type GroupMembershipRole = (typeof GROUP_MEMBERSHIP_ROLES)[number];

export const GROUP_ADMIN_MEMBERSHIP_ROLES = ["owner", "admin"] as const;
export type GroupAdminMembershipRole = (typeof GROUP_ADMIN_MEMBERSHIP_ROLES)[number];

export const GROUP_MANAGEABLE_MEMBERSHIP_ROLES = ["admin", "member"] as const;
export type GroupManageableMembershipRole = (typeof GROUP_MANAGEABLE_MEMBERSHIP_ROLES)[number];

export const GROUP_MEMBERSHIP_STATUSES = ["active", "left", "removed"] as const;
export type GroupMembershipStatus = (typeof GROUP_MEMBERSHIP_STATUSES)[number];

export const GROUP_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "revoked",
  "expired",
] as const;
export type GroupInvitationStatus = (typeof GROUP_INVITATION_STATUSES)[number];

export const GROUP_JOIN_REQUEST_STATUSES = [
  "pending",
  "approved",
  "declined",
  "cancelled",
] as const;
export type GroupJoinRequestStatus = (typeof GROUP_JOIN_REQUEST_STATUSES)[number];

export const GROUP_EVENT_RSVP_STATUSES = ["accepted", "declined", "tentative"] as const;
export type GroupEventRsvpStatus = (typeof GROUP_EVENT_RSVP_STATUSES)[number];
export const GROUP_EVENT_SERIES_RSVP_STATUSES = GROUP_EVENT_RSVP_STATUSES;
export type GroupEventSeriesRsvpStatus = (typeof GROUP_EVENT_SERIES_RSVP_STATUSES)[number];

export const GROUP_JOIN_REQUEST_REVIEW_DECISIONS = ["approve", "decline"] as const;
export type GroupJoinRequestReviewDecision = (typeof GROUP_JOIN_REQUEST_REVIEW_DECISIONS)[number];

export const GROUP_RELATIONSHIP_STATES = [
  "owner",
  "admin",
  "member",
  "invited",
  "requested",
  "non_member",
  "removed",
] as const;
export type GroupRelationshipState = (typeof GROUP_RELATIONSHIP_STATES)[number];

export const GROUP_NAME_MAX_LENGTH = 80;
export const GROUP_DESCRIPTION_MAX_LENGTH = 2000;
export const GROUP_LIST_SEARCH_MAX_LENGTH = 200;
export const GROUP_LIST_LIMIT_DEFAULT = 20;
export const GROUP_LIST_LIMIT_MAX = 100;
export const GROUP_INVITE_PROFILE_LIMIT_MAX = 100;
export const GROUP_EVENT_TITLE_MAX_LENGTH = 120;
export const GROUP_EVENT_DESCRIPTION_MAX_LENGTH = 4000;
export const GROUP_EVENT_ACTIVITY_PLAN_LABEL_MAX_LENGTH = 120;
export const GROUP_EVENT_ACTIVITY_PLAN_OPTION_LIMIT_MAX = 20;
export const GROUP_EVENT_DEFAULT_TIMEZONE = "UTC";
