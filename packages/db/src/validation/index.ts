import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

import {
  activityCategoryEnum,
  effortTypeEnum,
  eventStatusEnum,
  eventTypeEnum,
  genderEnum,
  integrationProviderEnum,
  profileMetricTypeEnum,
  trainingEffectLabelEnum,
} from "../schema/enums";
import {
  activities,
  activityEfforts,
  activityPlans,
  activityRoutes,
  integrations,
  profileMetrics,
  profiles,
} from "../schema/tables";

export const publicActivityCategorySchema = z.enum(activityCategoryEnum.enumValues);
export const publicEffortTypeSchema = z.enum(effortTypeEnum.enumValues);
export const publicEventStatusSchema = z.enum(eventStatusEnum.enumValues);
export const publicEventTypeSchema = z.enum(eventTypeEnum.enumValues);
export const publicGenderSchema = z.enum(genderEnum.enumValues);
export const publicIntegrationProviderSchema = z.enum(integrationProviderEnum.enumValues);
export const publicProfileMetricTypeSchema = z.enum(profileMetricTypeEnum.enumValues);
export const publicTrainingEffectLabelSchema = z.enum(trainingEffectLabelEnum.enumValues);

export const publicProfilesRowSchema = createSelectSchema(profiles);
export const publicProfilesInsertSchema = createInsertSchema(profiles);
export const publicProfilesUpdateSchema = createUpdateSchema(profiles);

export const publicActivityRoutesRowSchema = createSelectSchema(activityRoutes);
export const publicActivityRoutesInsertSchema = createInsertSchema(activityRoutes);
export const publicActivityRoutesUpdateSchema = createUpdateSchema(activityRoutes);

export const publicActivityPlansRowSchema = createSelectSchema(activityPlans);
export const publicActivityPlansInsertSchema = createInsertSchema(activityPlans);
export const publicActivityPlansUpdateSchema = createUpdateSchema(activityPlans);

export const publicActivitiesRowSchema = createSelectSchema(activities);
export const publicActivitiesInsertSchema = createInsertSchema(activities);
export const publicActivitiesUpdateSchema = createUpdateSchema(activities);

export const publicActivityEffortsRowSchema = createSelectSchema(activityEfforts);
export const publicActivityEffortsInsertSchema = createInsertSchema(activityEfforts);
export const publicActivityEffortsUpdateSchema = createUpdateSchema(activityEfforts);

export const publicIntegrationsRowSchema = createSelectSchema(integrations);
export const publicIntegrationsInsertSchema = createInsertSchema(integrations);
export const publicIntegrationsUpdateSchema = createUpdateSchema(integrations);

export const publicProfileMetricsRowSchema = createSelectSchema(profileMetrics);
export const publicProfileMetricsInsertSchema = createInsertSchema(profileMetrics);
export const publicProfileMetricsUpdateSchema = createUpdateSchema(profileMetrics);

export type PublicActivityCategory = z.infer<typeof publicActivityCategorySchema>;
export type PublicEffortType = z.infer<typeof publicEffortTypeSchema>;
export type PublicIntegrationProvider = z.infer<typeof publicIntegrationProviderSchema>;
export type PublicProfilesRow = z.infer<typeof publicProfilesRowSchema>;
export type PublicProfilesInsert = z.infer<typeof publicProfilesInsertSchema>;
export type PublicProfilesUpdate = z.infer<typeof publicProfilesUpdateSchema>;
export type PublicActivityRoutesRow = z.infer<typeof publicActivityRoutesRowSchema>;
export type PublicActivityRoutesInsert = z.infer<typeof publicActivityRoutesInsertSchema>;
export type PublicActivityRoutesUpdate = z.infer<typeof publicActivityRoutesUpdateSchema>;
export type PublicActivityPlansRow = z.infer<typeof publicActivityPlansRowSchema>;
export type PublicActivityPlansInsert = z.infer<typeof publicActivityPlansInsertSchema>;
export type PublicActivityPlansUpdate = z.infer<typeof publicActivityPlansUpdateSchema>;
export type PublicActivitiesRow = z.infer<typeof publicActivitiesRowSchema>;
export type PublicActivitiesInsert = z.infer<typeof publicActivitiesInsertSchema>;
export type PublicActivitiesUpdate = z.infer<typeof publicActivitiesUpdateSchema>;
export type PublicActivityEffortsRow = z.infer<typeof publicActivityEffortsRowSchema>;
export type PublicActivityEffortsInsert = z.infer<typeof publicActivityEffortsInsertSchema>;
export type PublicActivityEffortsUpdate = z.infer<typeof publicActivityEffortsUpdateSchema>;
export type PublicIntegrationsRow = z.infer<typeof publicIntegrationsRowSchema>;
export type PublicIntegrationsInsert = z.infer<typeof publicIntegrationsInsertSchema>;
export type PublicIntegrationsUpdate = z.infer<typeof publicIntegrationsUpdateSchema>;
export type PublicProfileMetricsRow = z.infer<typeof publicProfileMetricsRowSchema>;
export type PublicProfileMetricsInsert = z.infer<typeof publicProfileMetricsInsertSchema>;
export type PublicProfileMetricsUpdate = z.infer<typeof publicProfileMetricsUpdateSchema>;
