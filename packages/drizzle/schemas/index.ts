// Export all schemas and enums
export * from "./activities";
export * from "./activity_results";
export * from "./activity_streams";
export * from "./planned_activities";
export * from "./profile_plans";
export * from "./profiles";

// Re-export relations if you need them
import { relations } from "drizzle-orm";
import { activities } from "./activities";
import { activityResults } from "./activity_results";
import { activityStreams } from "./activity_streams";
import { plannedActivities } from "./planned_activities";
import { profilePlans } from "./profile_plans";
import { profiles } from "./profiles";

// Define relationships
export const profilesRelations = relations(profiles, ({ many }) => ({
  plans: many(profilePlans),
  plannedActivities: many(plannedActivities),
  activities: many(activities),
}));

export const profilePlansRelations = relations(
  profilePlans,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [profilePlans.profileId],
      references: [profiles.id],
    }),
    plannedActivities: many(plannedActivities),
  }),
);

export const plannedActivitiesRelations = relations(
  plannedActivities,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [plannedActivities.profileId],
      references: [profiles.id],
    }),
    profilePlan: one(profilePlans, {
      fields: [plannedActivities.profilePlanId],
      references: [profilePlans.id],
    }),
  }),
);

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activities.profileId],
    references: [profiles.id],
  }),
  results: many(activityResults),
  streams: many(activityStreams),
}));

export const activityResultsRelations = relations(
  activityResults,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activityResults.activityId],
      references: [activities.id],
    }),
  }),
);

export const activityStreamsRelations = relations(
  activityStreams,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activityStreams.activityId],
      references: [activities.id],
    }),
  }),
);
