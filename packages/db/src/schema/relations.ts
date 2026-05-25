import { relations } from "drizzle-orm";

import {
  activities,
  activityEfforts,
  activityFileIngestions,
  activityGeometry,
  activityImports,
  activityLaps,
  activityPlans,
  activityRoutes,
  activitySummaries,
  comments,
  conversationParticipants,
  conversations,
  eventExternalLinks,
  eventPayloads,
  eventRecurrence,
  eventScheduleLinks,
  events,
  follows,
  groupEventActivityPlans,
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
  profileGoals,
  profileMetrics,
  profiles,
  profileTrainingSettings,
  providerSyncJobs,
  providerSyncState,
  providerWebhookReceipts,
  trainingPlans,
  userTrainingPlans,
} from "./tables";

export const profilesRelations = relations(profiles, ({ many }) => ({
  activities: many(activities),
  activityFileIngestions: many(activityFileIngestions),
  activityGeometry: many(activityGeometry),
  activityImports: many(activityImports),
  activityLaps: many(activityLaps),
  activityPlans: many(activityPlans),
  activityRoutes: many(activityRoutes),
  activitySummaries: many(activitySummaries),
  conversationParticipants: many(conversationParticipants),
  conversationsStarted: many(messages, { relationName: "messageSender" }),
  events: many(events),
  eventExternalLinks: many(eventExternalLinks),
  eventPayloads: many(eventPayloads),
  eventRecurrence: many(eventRecurrence),
  eventScheduleLinks: many(eventScheduleLinks),
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
  profileGoals: many(profileGoals),
  profileMetrics: many(profileMetrics),
  providerSyncJobs: many(providerSyncJobs),
  providerWebhookReceipts: many(providerWebhookReceipts),
  profileTrainingSettings: many(profileTrainingSettings),
  integrationResourceLinks: many(integrationResourceLinks),
  trainingPlans: many(trainingPlans),
  userTrainingPlans: many(userTrainingPlans),
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
  activityPlans: many(groupEventActivityPlans),
  rsvps: many(groupEventRsvps),
  seriesRsvps: many(groupEventSeriesRsvps),
}));

export const groupEventActivityPlansRelations = relations(
  groupEventActivityPlans,
  ({ one, many }) => ({
    groupEvent: one(groupEvents, {
      fields: [groupEventActivityPlans.group_event_id],
      references: [groupEvents.id],
    }),
    activityPlan: one(activityPlans, {
      fields: [groupEventActivityPlans.activity_plan_id],
      references: [activityPlans.id],
    }),
    rsvps: many(groupEventRsvps),
  }),
);

export const groupEventRsvpsRelations = relations(groupEventRsvps, ({ one }) => ({
  groupEvent: one(groupEvents, {
    fields: [groupEventRsvps.group_event_id],
    references: [groupEvents.id],
  }),
  profile: one(profiles, {
    fields: [groupEventRsvps.profile_id],
    references: [profiles.id],
  }),
  selectedActivityPlan: one(groupEventActivityPlans, {
    fields: [groupEventRsvps.selected_group_event_activity_plan_id],
    references: [groupEventActivityPlans.id],
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
  activityPlans: many(activityPlans),
  eventScheduleLinks: many(eventScheduleLinks),
  groupEvents: many(groupEvents),
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
  eventScheduleLinks: many(eventScheduleLinks),
  groupEventActivityPlans: many(groupEventActivityPlans),
}));

export const trainingPlansRelations = relations(trainingPlans, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [trainingPlans.profile_id],
    references: [profiles.id],
  }),
  eventScheduleLinks: many(eventScheduleLinks),
  userTrainingPlans: many(userTrainingPlans),
}));

export const userTrainingPlansRelations = relations(userTrainingPlans, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [userTrainingPlans.profile_id],
    references: [profiles.id],
  }),
  trainingPlan: one(trainingPlans, {
    fields: [userTrainingPlans.training_plan_id],
    references: [trainingPlans.id],
  }),
  eventScheduleLinks: many(eventScheduleLinks),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [events.profile_id],
    references: [profiles.id],
  }),
  integrationResourceLinks: many(integrationResourceLinks, {
    relationName: "eventIntegrationResourceLinks",
  }),
  scheduleLink: one(eventScheduleLinks, {
    fields: [events.id],
    references: [eventScheduleLinks.event_id],
  }),
  externalLink: one(eventExternalLinks, {
    fields: [events.id],
    references: [eventExternalLinks.event_id],
  }),
  recurrenceDetails: one(eventRecurrence, {
    fields: [events.id],
    references: [eventRecurrence.event_id],
  }),
  recurrenceOccurrences: many(eventRecurrence, {
    relationName: "eventRecurrenceSeriesOccurrences",
  }),
  payloads: one(eventPayloads, {
    fields: [events.id],
    references: [eventPayloads.event_id],
  }),
}));

export const eventScheduleLinksRelations = relations(eventScheduleLinks, ({ one }) => ({
  event: one(events, {
    fields: [eventScheduleLinks.event_id],
    references: [events.id],
  }),
  profile: one(profiles, {
    fields: [eventScheduleLinks.profile_id],
    references: [profiles.id],
  }),
  trainingPlan: one(trainingPlans, {
    fields: [eventScheduleLinks.training_plan_id],
    references: [trainingPlans.id],
  }),
  activityPlan: one(activityPlans, {
    fields: [eventScheduleLinks.activity_plan_id],
    references: [activityPlans.id],
  }),
  linkedActivity: one(activities, {
    fields: [eventScheduleLinks.linked_activity_id],
    references: [activities.id],
  }),
  route: one(activityRoutes, {
    fields: [eventScheduleLinks.route_id],
    references: [activityRoutes.id],
  }),
  userTrainingPlan: one(userTrainingPlans, {
    fields: [eventScheduleLinks.user_training_plan_id],
    references: [userTrainingPlans.id],
  }),
}));

export const eventExternalLinksRelations = relations(eventExternalLinks, ({ one }) => ({
  event: one(events, {
    fields: [eventExternalLinks.event_id],
    references: [events.id],
  }),
  profile: one(profiles, {
    fields: [eventExternalLinks.profile_id],
    references: [profiles.id],
  }),
  integration: one(integrations, {
    fields: [eventExternalLinks.integration_account_id],
    references: [integrations.id],
  }),
}));

export const eventRecurrenceRelations = relations(eventRecurrence, ({ one }) => ({
  event: one(events, {
    fields: [eventRecurrence.event_id],
    references: [events.id],
  }),
  profile: one(profiles, {
    fields: [eventRecurrence.profile_id],
    references: [profiles.id],
  }),
  series: one(events, {
    relationName: "eventRecurrenceSeriesOccurrences",
    fields: [eventRecurrence.series_id],
    references: [events.id],
  }),
}));

export const eventPayloadsRelations = relations(eventPayloads, ({ one }) => ({
  event: one(events, {
    fields: [eventPayloads.event_id],
    references: [events.id],
  }),
  profile: one(profiles, {
    fields: [eventPayloads.profile_id],
    references: [profiles.id],
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
  summary: one(activitySummaries, {
    fields: [activities.id],
    references: [activitySummaries.activity_id],
  }),
  import: one(activityImports, {
    fields: [activities.id],
    references: [activityImports.activity_id],
  }),
  geometry: one(activityGeometry, {
    fields: [activities.id],
    references: [activityGeometry.activity_id],
  }),
  laps: many(activityLaps),
  fileIngestions: many(activityFileIngestions),
}));

export const activitySummariesRelations = relations(activitySummaries, ({ one }) => ({
  activity: one(activities, {
    fields: [activitySummaries.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activitySummaries.profile_id],
    references: [profiles.id],
  }),
}));

export const activityImportsRelations = relations(activityImports, ({ one }) => ({
  activity: one(activities, {
    fields: [activityImports.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activityImports.profile_id],
    references: [profiles.id],
  }),
}));

export const activityGeometryRelations = relations(activityGeometry, ({ one }) => ({
  activity: one(activities, {
    fields: [activityGeometry.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activityGeometry.profile_id],
    references: [profiles.id],
  }),
}));

export const activityLapsRelations = relations(activityLaps, ({ one }) => ({
  activity: one(activities, {
    fields: [activityLaps.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activityLaps.profile_id],
    references: [profiles.id],
  }),
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
  eventExternalLinks: many(eventExternalLinks),
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
  groupInvitationsRelations,
  groupJoinRequestsRelations,
  groupEventsRelations,
  groupEventActivityPlansRelations,
  groupEventRsvpsRelations,
  activityRoutesRelations,
  activityPlansRelations,
  trainingPlansRelations,
  userTrainingPlansRelations,
  eventsRelations,
  eventScheduleLinksRelations,
  eventExternalLinksRelations,
  eventRecurrenceRelations,
  eventPayloadsRelations,
  activitiesRelations,
  activitySummariesRelations,
  activityImportsRelations,
  activityGeometryRelations,
  activityLapsRelations,
  activityFileIngestionsRelations,
  activityEffortsRelations,
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
