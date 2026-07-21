import { relations } from "drizzle-orm";

import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityFileIngestions,
  activityPlans,
  activityRoutes,
  activitySegments,
  comments,
  conversationParticipants,
  conversations,
  events,
  follows,
  groupEventRsvps,
  groupEventSeriesRsvps,
  groupEvents,
  groupInvitations,
  groupJoinRequests,
  groupMemberships,
  groups,
  integrationCredentials,
  integrationResourceLinks,
  integrations,
  likes,
  messages,
  notifications,
  oauthStates,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizationPermissions,
  organizationRolePermissionGrants,
  organizationRoles,
  organizations,
  profileGoals,
  profileMetrics,
  profiles,
  profileTrainingSettings,
  providerSyncJobs,
  providerSyncState,
  providerWebhookReceipts,
  trainingPlans,
} from "./tables";

export const profilesRelations = relations(profiles, ({ many }) => ({
  activities: many(activities),
  activityArtifacts: many(activityArtifacts),
  activitySegments: many(activitySegments),
  activityFileIngestions: many(activityFileIngestions),
  activityPlans: many(activityPlans),
  activityRoutes: many(activityRoutes),
  conversationParticipants: many(conversationParticipants),
  conversationsStarted: many(messages, { relationName: "messageSender" }),
  events: many(events),
  groupEventsCreated: many(groupEvents, { relationName: "groupEventCreator" }),
  groupEventRsvps: many(groupEventRsvps),
  groupEventSeriesRsvps: many(groupEventSeriesRsvps),
  groupsCreated: many(groups, { relationName: "groupCreator" }),
  groupMemberships: many(groupMemberships),
  groupInvitations: many(groupInvitations, { relationName: "groupInvitationRecipient" }),
  groupJoinRequests: many(groupJoinRequests),
  integrations: many(integrations),
  likes: many(likes),
  messages: many(messages, { relationName: "messageSender" }),
  comments: many(comments),
  outgoingFollows: many(follows, { relationName: "follower" }),
  incomingFollows: many(follows, { relationName: "following" }),
  notificationsReceived: many(notifications, { relationName: "notificationRecipient" }),
  notificationsTriggered: many(notifications, { relationName: "notificationActor" }),
  oauthStates: many(oauthStates),
  organizationsCreated: many(organizations, { relationName: "organizationCreator" }),
  organizationMemberships: many(organizationMemberships),
  profileGoals: many(profileGoals),
  profileMetrics: many(profileMetrics),
  providerSyncJobs: many(providerSyncJobs),
  providerWebhookReceipts: many(providerWebhookReceipts),
  profileTrainingSettings: many(profileTrainingSettings),
  integrationResourceLinks: many(integrationResourceLinks),
  trainingPlans: many(trainingPlans),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  createdByProfile: one(profiles, {
    relationName: "groupCreator",
    fields: [groups.created_by_profile_id],
    references: [profiles.id],
  }),
  memberships: many(groupMemberships),
  invitations: many(groupInvitations),
  joinRequests: many(groupJoinRequests),
  events: many(groupEvents),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, {
    fields: [groupMemberships.group_id],
    references: [groups.id],
  }),
  profile: one(profiles, {
    fields: [groupMemberships.profile_id],
    references: [profiles.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  createdByProfile: one(profiles, {
    relationName: "organizationCreator",
    fields: [organizations.created_by_profile_id],
    references: [profiles.id],
  }),
  memberships: many(organizationMemberships),
  roles: many(organizationRoles),
}));

export const organizationMembershipsRelations = relations(
  organizationMemberships,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [organizationMemberships.organization_id],
      references: [organizations.id],
    }),
    profile: one(profiles, {
      fields: [organizationMemberships.profile_id],
      references: [profiles.id],
    }),
    roleGrants: many(organizationMembershipRoleGrants),
  }),
);

export const organizationRolesRelations = relations(organizationRoles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationRoles.organization_id],
    references: [organizations.id],
  }),
  permissionGrants: many(organizationRolePermissionGrants),
  membershipGrants: many(organizationMembershipRoleGrants),
}));

export const organizationPermissionsRelations = relations(organizationPermissions, ({ many }) => ({
  roleGrants: many(organizationRolePermissionGrants),
}));

export const organizationRolePermissionGrantsRelations = relations(
  organizationRolePermissionGrants,
  ({ one }) => ({
    role: one(organizationRoles, {
      fields: [organizationRolePermissionGrants.role_id],
      references: [organizationRoles.id],
    }),
    permission: one(organizationPermissions, {
      fields: [organizationRolePermissionGrants.permission_key],
      references: [organizationPermissions.key],
    }),
  }),
);

export const organizationMembershipRoleGrantsRelations = relations(
  organizationMembershipRoleGrants,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembershipRoleGrants.organization_id],
      references: [organizations.id],
    }),
    membership: one(organizationMemberships, {
      fields: [organizationMembershipRoleGrants.membership_id],
      references: [organizationMemberships.id],
    }),
    role: one(organizationRoles, {
      fields: [organizationMembershipRoleGrants.role_id],
      references: [organizationRoles.id],
    }),
  }),
);

export const groupInvitationsRelations = relations(groupInvitations, ({ one }) => ({
  group: one(groups, {
    fields: [groupInvitations.group_id],
    references: [groups.id],
  }),
  invitedProfile: one(profiles, {
    relationName: "groupInvitationRecipient",
    fields: [groupInvitations.invited_profile_id],
    references: [profiles.id],
  }),
}));

export const groupJoinRequestsRelations = relations(groupJoinRequests, ({ one }) => ({
  group: one(groups, {
    fields: [groupJoinRequests.group_id],
    references: [groups.id],
  }),
  profile: one(profiles, {
    fields: [groupJoinRequests.profile_id],
    references: [profiles.id],
  }),
}));

export const groupEventsRelations = relations(groupEvents, ({ one, many }) => ({
  group: one(groups, {
    fields: [groupEvents.group_id],
    references: [groups.id],
  }),
  createdByProfile: one(profiles, {
    relationName: "groupEventCreator",
    fields: [groupEvents.created_by_profile_id],
    references: [profiles.id],
  }),
  series: one(groupEvents, {
    relationName: "groupEventSeriesOccurrences",
    fields: [groupEvents.series_id],
    references: [groupEvents.id],
  }),
  occurrences: many(groupEvents, { relationName: "groupEventSeriesOccurrences" }),
  route: one(activityRoutes, {
    fields: [groupEvents.route_id],
    references: [activityRoutes.id],
  }),
  activityPlan: one(activityPlans, {
    fields: [groupEvents.activity_plan_id],
    references: [activityPlans.id],
  }),
  rsvps: many(groupEventRsvps),
  seriesRsvps: many(groupEventSeriesRsvps),
}));

export const groupEventRsvpsRelations = relations(groupEventRsvps, ({ one }) => ({
  groupEvent: one(groupEvents, {
    fields: [groupEventRsvps.group_event_id],
    references: [groupEvents.id],
  }),
  profile: one(profiles, {
    fields: [groupEventRsvps.profile_id],
    references: [profiles.id],
  }),
}));

export const groupEventSeriesRsvpsRelations = relations(groupEventSeriesRsvps, ({ one }) => ({
  groupEventSeries: one(groupEvents, {
    fields: [groupEventSeriesRsvps.group_event_series_id],
    references: [groupEvents.id],
  }),
  profile: one(profiles, {
    fields: [groupEventSeriesRsvps.profile_id],
    references: [profiles.id],
  }),
}));

export const activityRoutesRelations = relations(activityRoutes, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityRoutes.profile_id],
    references: [profiles.id],
  }),
  events: many(events),
  groupEvents: many(groupEvents),
  activityPlans: many(activityPlans),
}));

export const activityPlansRelations = relations(activityPlans, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityPlans.profile_id],
    references: [profiles.id],
  }),
  route: one(activityRoutes, {
    fields: [activityPlans.route_id],
    references: [activityRoutes.id],
  }),
  activities: many(activities),
  events: many(events),
  groupEvents: many(groupEvents),
}));

export const trainingPlansRelations = relations(trainingPlans, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [trainingPlans.profile_id],
    references: [profiles.id],
  }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [events.profile_id],
    references: [profiles.id],
  }),
  integrationResourceLinks: many(integrationResourceLinks, {
    relationName: "eventIntegrationResourceLinks",
  }),
  trainingPlan: one(trainingPlans, {
    fields: [events.training_plan_id],
    references: [trainingPlans.id],
  }),
  activityPlan: one(activityPlans, {
    fields: [events.activity_plan_id],
    references: [activityPlans.id],
  }),
  linkedActivity: one(activities, {
    fields: [events.linked_activity_id],
    references: [activities.id],
  }),
  route: one(activityRoutes, {
    fields: [events.route_id],
    references: [activityRoutes.id],
  }),
  integration: one(integrations, {
    fields: [events.integration_account_id],
    references: [integrations.id],
  }),
  series: one(events, {
    relationName: "eventRecurrenceSeriesOccurrences",
    fields: [events.series_id],
    references: [events.id],
  }),
  recurrenceOccurrences: many(events, {
    relationName: "eventRecurrenceSeriesOccurrences",
  }),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activities.profile_id],
    references: [profiles.id],
  }),
  activityPlan: one(activityPlans, {
    fields: [activities.activity_plan_id],
    references: [activityPlans.id],
  }),
  efforts: many(activityEfforts),
  fileIngestions: many(activityFileIngestions),
  artifactLinks: many(activityArtifactLinks),
  segments: many(activitySegments),
}));

export const activityArtifactsRelations = relations(activityArtifacts, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityArtifacts.profile_id],
    references: [profiles.id],
  }),
  links: many(activityArtifactLinks),
  ingestions: many(activityFileIngestions),
  sourcedSegments: many(activitySegments),
}));

export const activityArtifactLinksRelations = relations(activityArtifactLinks, ({ one }) => ({
  activity: one(activities, {
    fields: [activityArtifactLinks.activity_id],
    references: [activities.id],
  }),
  artifact: one(activityArtifacts, {
    fields: [activityArtifactLinks.artifact_id],
    references: [activityArtifacts.id],
  }),
  profile: one(profiles, {
    fields: [activityArtifactLinks.profile_id],
    references: [profiles.id],
  }),
}));

export const activitySegmentsRelations = relations(activitySegments, ({ one, many }) => ({
  activity: one(activities, {
    fields: [activitySegments.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activitySegments.profile_id],
    references: [profiles.id],
  }),
  sourceArtifact: one(activityArtifacts, {
    fields: [activitySegments.source_artifact_id],
    references: [activityArtifacts.id],
  }),
  efforts: many(activityEfforts),
}));

export const activityFileIngestionsRelations = relations(activityFileIngestions, ({ one }) => ({
  activity: one(activities, {
    fields: [activityFileIngestions.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activityFileIngestions.profile_id],
    references: [profiles.id],
  }),
  artifact: one(activityArtifacts, {
    fields: [activityFileIngestions.artifact_id],
    references: [activityArtifacts.id],
  }),
}));

export const activityEffortsRelations = relations(activityEfforts, ({ one }) => ({
  profile: one(profiles, {
    fields: [activityEfforts.profile_id],
    references: [profiles.id],
  }),
  activity: one(activities, {
    fields: [activityEfforts.activity_id],
    references: [activities.id],
  }),
  segment: one(activitySegments, {
    fields: [activityEfforts.segment_id],
    references: [activitySegments.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [integrations.profile_id],
    references: [profiles.id],
  }),
  credentials: one(integrationCredentials, {
    fields: [integrations.id],
    references: [integrationCredentials.integration_id],
  }),
  events: many(events),
  resourceLinks: many(integrationResourceLinks),
  syncJobs: many(providerSyncJobs),
  syncState: many(providerSyncState),
  webhookReceipts: many(providerWebhookReceipts),
}));

export const integrationCredentialsRelations = relations(integrationCredentials, ({ one }) => ({
  integration: one(integrations, {
    fields: [integrationCredentials.integration_id],
    references: [integrations.id],
  }),
}));

export const profileMetricsRelations = relations(profileMetrics, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileMetrics.profile_id],
    references: [profiles.id],
  }),
  referenceActivity: one(activities, {
    fields: [profileMetrics.reference_activity_id],
    references: [activities.id],
  }),
}));

export const profileTrainingSettingsRelations = relations(profileTrainingSettings, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileTrainingSettings.profile_id],
    references: [profiles.id],
  }),
}));

export const providerSyncStateRelations = relations(providerSyncState, ({ one }) => ({
  integration: one(integrations, {
    fields: [providerSyncState.integration_id],
    references: [integrations.id],
  }),
}));

export const providerSyncJobsRelations = relations(providerSyncJobs, ({ one }) => ({
  profile: one(profiles, {
    fields: [providerSyncJobs.profile_id],
    references: [profiles.id],
  }),
  integration: one(integrations, {
    fields: [providerSyncJobs.integration_id],
    references: [integrations.id],
  }),
}));

export const providerWebhookReceiptsRelations = relations(providerWebhookReceipts, ({ one }) => ({
  integration: one(integrations, {
    fields: [providerWebhookReceipts.integration_id],
    references: [integrations.id],
  }),
  job: one(providerSyncJobs, {
    fields: [providerWebhookReceipts.job_id],
    references: [providerSyncJobs.id],
  }),
}));

export const profileGoalsRelations = relations(profileGoals, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileGoals.profile_id],
    references: [profiles.id],
  }),
}));

export const oauthStatesRelations = relations(oauthStates, ({ one }) => ({
  profile: one(profiles, {
    fields: [oauthStates.profile_id],
    references: [profiles.id],
  }),
}));

export const integrationResourceLinksRelations = relations(integrationResourceLinks, ({ one }) => ({
  profile: one(profiles, {
    fields: [integrationResourceLinks.profile_id],
    references: [profiles.id],
  }),
  integration: one(integrations, {
    fields: [integrationResourceLinks.integration_id],
    references: [integrations.id],
  }),
  event: one(events, {
    relationName: "eventIntegrationResourceLinks",
    fields: [integrationResourceLinks.internal_resource_id],
    references: [events.id],
  }),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  profile: one(profiles, {
    fields: [likes.profile_id],
    references: [profiles.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(profiles, {
    relationName: "notificationRecipient",
    fields: [notifications.user_id],
    references: [profiles.id],
  }),
  actor: one(profiles, {
    relationName: "notificationActor",
    fields: [notifications.actor_id],
    references: [profiles.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversation_id],
    references: [conversations.id],
  }),
  user: one(profiles, {
    fields: [conversationParticipants.user_id],
    references: [profiles.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversation_id],
    references: [conversations.id],
  }),
  sender: one(profiles, {
    relationName: "messageSender",
    fields: [messages.sender_id],
    references: [profiles.id],
  }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(profiles, {
    relationName: "follower",
    fields: [follows.follower_id],
    references: [profiles.id],
  }),
  following: one(profiles, {
    relationName: "following",
    fields: [follows.following_id],
    references: [profiles.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  profile: one(profiles, {
    fields: [comments.profile_id],
    references: [profiles.id],
  }),
}));

export const relationsSchema = {
  profilesRelations,
  groupsRelations,
  groupMembershipsRelations,
  organizationsRelations,
  organizationMembershipsRelations,
  organizationRolesRelations,
  organizationPermissionsRelations,
  organizationRolePermissionGrantsRelations,
  organizationMembershipRoleGrantsRelations,
  groupInvitationsRelations,
  groupJoinRequestsRelations,
  groupEventsRelations,
  groupEventRsvpsRelations,
  activityRoutesRelations,
  activityPlansRelations,
  trainingPlansRelations,
  eventsRelations,
  activitiesRelations,
  activityArtifactLinksRelations,
  activityArtifactsRelations,
  activityFileIngestionsRelations,
  activityEffortsRelations,
  activitySegmentsRelations,
  integrationsRelations,
  integrationCredentialsRelations,
  providerSyncJobsRelations,
  providerSyncStateRelations,
  providerWebhookReceiptsRelations,
  profileTrainingSettingsRelations,
  profileGoalsRelations,
  profileMetricsRelations,
  oauthStatesRelations,
  integrationResourceLinksRelations,
  likesRelations,
  notificationsRelations,
  conversationsRelations,
  conversationParticipantsRelations,
  messagesRelations,
  followsRelations,
  commentsRelations,
};
