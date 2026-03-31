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
export const legacyPublicActivityPlansRowSchema = z.object({
  id: z.string().uuid(),
  idx: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  profile_id: z.string().uuid().nullable(),
  route_id: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  activity_category: publicActivityCategorySchema,
  estimated_duration_seconds: z.number().nullable().optional(),
  estimated_distance_meters: z.number().nullable().optional(),
  tss_target: z.number().nullable().optional(),
  is_public: z.boolean().optional(),
  structure: z.unknown().nullable().optional(),
  version: z.string().nullable().optional(),
  template_visibility: z.string().nullable().optional(),
  import_provider: z.string().nullable().optional(),
  import_external_id: z.string().nullable().optional(),
  is_system_template: z.boolean().nullable().optional(),
  duration_hours: z.number().nullable().optional(),
  sessions_per_week_target: z.number().nullable().optional(),
  likes_count: z.number().nullable().optional(),
});

export const publicActivitiesRowSchema = createSelectSchema(activities);
export const publicActivitiesInsertSchema = createInsertSchema(activities);
export const publicActivitiesUpdateSchema = createUpdateSchema(activities);
export const publicActivitiesCreateSchema = publicActivitiesInsertSchema.partial({
  created_at: true,
  id: true,
  idx: true,
  is_private: true,
  updated_at: true,
});

export const publicActivityEffortsRowSchema = createSelectSchema(activityEfforts);
export const publicActivityEffortsInsertSchema = createInsertSchema(activityEfforts);
export const publicActivityEffortsUpdateSchema = createUpdateSchema(activityEfforts);

export const publicIntegrationsRowSchema = createSelectSchema(integrations);
export const publicIntegrationsInsertSchema = createInsertSchema(integrations);
export const publicIntegrationsUpdateSchema = createUpdateSchema(integrations);
export const legacyPublicIntegrationsRowSchema = z.object({
  id: z.string().uuid(),
  idx: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  profile_id: z.string().uuid(),
  provider: publicIntegrationProviderSchema,
  external_id: z.string(),
  access_token: z.string(),
  refresh_token: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
});
export const legacyPublicIntegrationsInsertSchema = legacyPublicIntegrationsRowSchema.partial({
  id: true,
  idx: true,
  created_at: true,
  updated_at: true,
});
export const legacyPublicIntegrationsUpdateSchema = legacyPublicIntegrationsInsertSchema.partial();

export const publicProfileMetricsRowSchema = createSelectSchema(profileMetrics);
export const publicProfileMetricsInsertSchema = createInsertSchema(profileMetrics);
export const publicProfileMetricsUpdateSchema = createUpdateSchema(profileMetrics);

export type PublicActivityCategory = z.infer<typeof publicActivityCategorySchema>;
export type PublicEffortType = z.infer<typeof publicEffortTypeSchema>;
export type PublicEventStatus = z.infer<typeof publicEventStatusSchema>;
export type PublicEventType = z.infer<typeof publicEventTypeSchema>;
export type PublicGender = z.infer<typeof publicGenderSchema>;
export type PublicIntegrationProvider = z.infer<typeof publicIntegrationProviderSchema>;
export type PublicProfileMetricType = z.infer<typeof publicProfileMetricTypeSchema>;
export type PublicTrainingEffectLabel = z.infer<typeof publicTrainingEffectLabelSchema>;
export type PublicProfilesRow = z.infer<typeof publicProfilesRowSchema>;
export type PublicProfilesInsert = z.infer<typeof publicProfilesInsertSchema>;
export type PublicProfilesUpdate = z.infer<typeof publicProfilesUpdateSchema>;
export type PublicActivityRoutesRow = z.infer<typeof publicActivityRoutesRowSchema>;
export type PublicActivityRoutesInsert = z.infer<typeof publicActivityRoutesInsertSchema>;
export type PublicActivityRoutesUpdate = z.infer<typeof publicActivityRoutesUpdateSchema>;
export type PublicActivityPlansRow = z.infer<typeof publicActivityPlansRowSchema>;
export type PublicActivityPlansInsert = z.infer<typeof publicActivityPlansInsertSchema>;
export type PublicActivityPlansUpdate = z.infer<typeof publicActivityPlansUpdateSchema>;
export type LegacyPublicActivityPlansRow = z.infer<typeof legacyPublicActivityPlansRowSchema>;
export type PublicActivitiesRow = z.infer<typeof publicActivitiesRowSchema>;
export type PublicActivitiesInsert = z.infer<typeof publicActivitiesInsertSchema>;
export type PublicActivitiesCreate = z.infer<typeof publicActivitiesCreateSchema>;
export type PublicActivitiesUpdate = z.infer<typeof publicActivitiesUpdateSchema>;
export type PublicActivityEffortsRow = z.infer<typeof publicActivityEffortsRowSchema>;
export type PublicActivityEffortsInsert = z.infer<typeof publicActivityEffortsInsertSchema>;
export type PublicActivityEffortsUpdate = z.infer<typeof publicActivityEffortsUpdateSchema>;
export type PublicIntegrationsRow = z.infer<typeof publicIntegrationsRowSchema>;
export type PublicIntegrationsInsert = z.infer<typeof publicIntegrationsInsertSchema>;
export type PublicIntegrationsUpdate = z.infer<typeof publicIntegrationsUpdateSchema>;
export type LegacyPublicIntegrationsRow = z.infer<typeof legacyPublicIntegrationsRowSchema>;
export type LegacyPublicIntegrationsInsert = z.infer<typeof legacyPublicIntegrationsInsertSchema>;
export type LegacyPublicIntegrationsUpdate = z.infer<typeof legacyPublicIntegrationsUpdateSchema>;
export type PublicProfileMetricsRow = z.infer<typeof publicProfileMetricsRowSchema>;
export type PublicProfileMetricsInsert = z.infer<typeof publicProfileMetricsInsertSchema>;
export type PublicProfileMetricsUpdate = z.infer<typeof publicProfileMetricsUpdateSchema>;
