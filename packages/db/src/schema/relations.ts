import { relations } from "drizzle-orm";

import {
  activities,
  activityEfforts,
  activityPlans,
  activityRoutes,
  integrations,
  profileMetrics,
  profiles,
} from "./tables";

export const profilesRelations = relations(profiles, ({ many }) => ({
  activities: many(activities),
  activityPlans: many(activityPlans),
  activityRoutes: many(activityRoutes),
  integrations: many(integrations),
  profileMetrics: many(profileMetrics),
}));

export const activityRoutesRelations = relations(activityRoutes, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityRoutes.profile_id],
    references: [profiles.id],
  }),
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
}));

export const relationsSchema = {
  profilesRelations,
  activityRoutesRelations,
  activityPlansRelations,
  activitiesRelations,
  activityEffortsRelations,
  integrationsRelations,
  profileMetricsRelations,
};
