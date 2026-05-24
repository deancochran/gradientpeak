import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type {
  GroupAccessLevel,
  GroupJoinPolicy,
  GroupMembershipRole,
  GroupRelationshipState,
  GroupViewerState,
} from "@repo/core/groups";

type GroupOutputs = inferRouterOutputs<AppRouter>["groups"];

export type GroupSummary = GroupOutputs["listDiscoverable"]["items"][number];
export type MyGroupSummary = GroupOutputs["myGroups"]["items"][number];
export type ProfileGroupSummary = GroupOutputs["forProfile"]["items"][number];
export type GroupDetailResult = GroupOutputs["detail"];
export type GroupDetail = GroupDetailResult["group"];
export type GroupMember = GroupOutputs["members"]["items"][number];
export type GroupInvitation = GroupOutputs["pendingInvitations"]["items"][number];
export type MyGroupInvitation = GroupOutputs["myInvitations"]["items"][number];
export type GroupJoinRequest = GroupOutputs["pendingJoinRequests"]["items"][number];
export type GroupEventListResult = GroupOutputs["events"]["list"];
export type GroupEventListItem = GroupEventListResult["items"][number];
export type GroupEventSeriesOccurrencesResult = GroupOutputs["events"]["seriesOccurrences"];
export type GroupEventSeriesOccurrence = GroupEventSeriesOccurrencesResult["items"][number];
export type GroupEventDetailResult = GroupOutputs["events"]["detail"];
export type GroupEventDetail = GroupEventDetailResult["event"];
export type CurrentGroupEventPlanOptionsResult = GroupOutputs["events"]["currentEventPlanOptions"];
export type CurrentGroupEventPlan = NonNullable<CurrentGroupEventPlanOptionsResult["event"]>;
export type GroupEventActivityPlanOption = GroupEventDetail["activityPlanOptions"][number];
export type GroupEventRsvp = NonNullable<GroupEventDetail["viewerRsvp"]>;

export type GroupListItem = GroupSummary | MyGroupSummary | ProfileGroupSummary;

export type DisplayGroupViewerState = Pick<
  GroupViewerState,
  | "relationshipState"
  | "membershipRole"
  | "canJoin"
  | "canRequestToJoin"
  | "canAcceptInvite"
  | "canLeave"
  | "canEditGroup"
  | "canInvite"
  | "canManageJoinRequests"
  | "canManageMembers"
  | "canDeleteGroup"
  | "canViewGroupEvents"
  | "canCreateGroupEvent"
>;

export type {
  GroupAccessLevel,
  GroupJoinPolicy,
  GroupMembershipRole,
  GroupRelationshipState,
  GroupViewerState,
};
