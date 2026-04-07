import { relations } from "drizzle-orm";

import {
  activities,
  activityEfforts,
  activityPlans,
  activityRoutes,
  coachesAthletes,
  coachingInvitations,
  comments,
  conversationParticipants,
  conversations,
  events,
  follows,
  integrations,
  likes,
  messages,
  notifications,
  oauthStates,
  profileGoals,
  profileMetrics,
  profiles,
  profileTrainingSettings,
  syncedEvents,
  trainingPlans,
} from "./tables";

export const profilesRelations = relations(profiles, ({ many }) => ({
  activities: many(activities),
  activityPlans: many(activityPlans),
  activityRoutes: many(activityRoutes),
  coachingInvitationsReceived: many(coachingInvitations, {
    relationName: "coachingInvitationAthlete",
  }),
  coachingInvitationsSent: many(coachingInvitations, {
    relationName: "coachingInvitationCoach",
  }),
  coachedAthleteLinks: many(coachesAthletes, { relationName: "coachAthleteCoach" }),
  coachLink: many(coachesAthletes, { relationName: "coachAthleteAthlete" }),
  conversationParticipants: many(conversationParticipants),
  conversationsStarted: many(messages, { relationName: "messageSender" }),
  events: many(events),
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
  profileTrainingSettings: many(profileTrainingSettings),
  syncedEvents: many(syncedEvents),
  trainingPlans: many(trainingPlans),
}));

export const activityRoutesRelations = relations(activityRoutes, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityRoutes.profile_id],
    references: [profiles.id],
  }),
  activityPlans: many(activityPlans),
  events: many(events),
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
  trainingPlan: one(trainingPlans, {
    fields: [events.training_plan_id],
    references: [trainingPlans.id],
  }),
  activityPlan: one(activityPlans, {
    fields: [events.activity_plan_id],
    references: [activityPlans.id],
  }),
  route: one(activityRoutes, {
    fields: [events.route_id],
    references: [activityRoutes.id],
  }),
  syncedEvents: many(syncedEvents),
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

export const integrationsRelations = relations(integrations, ({ one }) => ({
  profile: one(profiles, {
    fields: [integrations.profile_id],
    references: [profiles.id],
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

export const profileGoalsRelations = relations(profileGoals, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileGoals.profile_id],
    references: [profiles.id],
  }),
  milestoneEvent: one(events, {
    fields: [profileGoals.milestone_event_id],
    references: [events.id],
  }),
}));

export const oauthStatesRelations = relations(oauthStates, ({ one }) => ({
  profile: one(profiles, {
    fields: [oauthStates.profile_id],
    references: [profiles.id],
  }),
}));

export const syncedEventsRelations = relations(syncedEvents, ({ one }) => ({
  profile: one(profiles, {
    fields: [syncedEvents.profile_id],
    references: [profiles.id],
  }),
  event: one(events, {
    fields: [syncedEvents.event_id],
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

export const coachingInvitationsRelations = relations(coachingInvitations, ({ one }) => ({
  athlete: one(profiles, {
    relationName: "coachingInvitationAthlete",
    fields: [coachingInvitations.athlete_id],
    references: [profiles.id],
  }),
  coach: one(profiles, {
    relationName: "coachingInvitationCoach",
    fields: [coachingInvitations.coach_id],
    references: [profiles.id],
  }),
}));

export const coachesAthletesRelations = relations(coachesAthletes, ({ one }) => ({
  coach: one(profiles, {
    relationName: "coachAthleteCoach",
    fields: [coachesAthletes.coach_id],
    references: [profiles.id],
  }),
  athlete: one(profiles, {
    relationName: "coachAthleteAthlete",
    fields: [coachesAthletes.athlete_id],
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
  activityRoutesRelations,
  activityPlansRelations,
  trainingPlansRelations,
  eventsRelations,
  activitiesRelations,
  activityEffortsRelations,
  integrationsRelations,
  profileTrainingSettingsRelations,
  profileGoalsRelations,
  profileMetricsRelations,
  oauthStatesRelations,
  syncedEventsRelations,
  likesRelations,
  notificationsRelations,
  coachingInvitationsRelations,
  coachesAthletesRelations,
  conversationsRelations,
  conversationParticipantsRelations,
  messagesRelations,
  followsRelations,
  commentsRelations,
};
