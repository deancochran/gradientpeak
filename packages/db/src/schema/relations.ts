import { relations } from "drizzle-orm";

import {
  activities,
  activityEfforts,
  activityPlans,
  activityRoutes,
  events,
  integrations,
  likes,
  oauthStates,
  profileMetrics,
  profiles,
  syncedEvents,
  trainingPlans,
} from "./tables";

export const profilesRelations = relations(profiles, ({ many }) => ({
  activities: many(activities),
  activityPlans: many(activityPlans),
  activityRoutes: many(activityRoutes),
  events: many(events),
  integrations: many(integrations),
  likes: many(likes),
  oauthStates: many(oauthStates),
  profileMetrics: many(profileMetrics),
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

export const relationsSchema = {
  profilesRelations,
  activityRoutesRelations,
  activityPlansRelations,
  trainingPlansRelations,
  eventsRelations,
  activitiesRelations,
  activityEffortsRelations,
  integrationsRelations,
  profileMetricsRelations,
  oauthStatesRelations,
  syncedEventsRelations,
  likesRelations,
};
