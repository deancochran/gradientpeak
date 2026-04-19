import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

import {
  activityCategoryEnum,
  effortTypeEnum,
  eventStatusEnum,
  eventTypeEnum,
  genderEnum,
  integrationResourceKindEnum,
  integrationProviderEnum,
  notificationTypeEnum,
  profileMetricTypeEnum,
  trainingEffectLabelEnum,
} from "../schema/enums";
import {
  activities,
  activityEfforts,
  activityPlans,
  activityRoutes,
  comments,
  conversationParticipants,
  conversations,
  events,
  follows,
  integrationResourceLinks,
  integrations,
  likes,
  messages,
  notifications,
  oauthStates,
  profileGoals,
  profileMetrics,
  profiles,
  providerSyncJobs,
  providerSyncState,
  providerWebhookReceipts,
  profileTrainingSettings,
  trainingPlans,
} from "../schema/tables";

export const publicActivityCategorySchema = z.enum(activityCategoryEnum.enumValues);
export const publicEffortTypeSchema = z.enum(effortTypeEnum.enumValues);
export const publicEventStatusSchema = z.enum(eventStatusEnum.enumValues);
export const publicEventTypeSchema = z.enum(eventTypeEnum.enumValues);
export const publicGenderSchema = z.enum(genderEnum.enumValues);
export const publicIntegrationResourceKindSchema = z.enum(integrationResourceKindEnum.enumValues);
export const publicIntegrationProviderSchema = z.enum(integrationProviderEnum.enumValues);
export const publicNotificationTypeSchema = z.enum(notificationTypeEnum.enumValues);
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

export const publicTrainingPlansRowSchema = createSelectSchema(trainingPlans);
export const publicTrainingPlansInsertSchema = createInsertSchema(trainingPlans);
export const publicTrainingPlansUpdateSchema = createUpdateSchema(trainingPlans);

export const publicEventsRowSchema = createSelectSchema(events);
export const publicEventsInsertSchema = createInsertSchema(events);
export const publicEventsUpdateSchema = createUpdateSchema(events);

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

export const publicProviderSyncStateRowSchema = createSelectSchema(providerSyncState);
export const publicProviderSyncStateInsertSchema = createInsertSchema(providerSyncState);
export const publicProviderSyncStateUpdateSchema = createUpdateSchema(providerSyncState);

export const publicProviderSyncJobsRowSchema = createSelectSchema(providerSyncJobs);
export const publicProviderSyncJobsInsertSchema = createInsertSchema(providerSyncJobs);
export const publicProviderSyncJobsUpdateSchema = createUpdateSchema(providerSyncJobs);

export const publicProviderWebhookReceiptsRowSchema = createSelectSchema(providerWebhookReceipts);
export const publicProviderWebhookReceiptsInsertSchema = createInsertSchema(providerWebhookReceipts);
export const publicProviderWebhookReceiptsUpdateSchema = createUpdateSchema(providerWebhookReceipts);

export const publicProfileMetricsRowSchema = createSelectSchema(profileMetrics);
export const publicProfileMetricsInsertSchema = createInsertSchema(profileMetrics);
export const publicProfileMetricsUpdateSchema = createUpdateSchema(profileMetrics);

export const publicProfileTrainingSettingsRowSchema = createSelectSchema(profileTrainingSettings);
export const publicProfileTrainingSettingsInsertSchema =
  createInsertSchema(profileTrainingSettings);
export const publicProfileTrainingSettingsUpdateSchema =
  createUpdateSchema(profileTrainingSettings);

export const publicProfileGoalsRowSchema = createSelectSchema(profileGoals);
export const publicProfileGoalsInsertSchema = createInsertSchema(profileGoals);
export const publicProfileGoalsUpdateSchema = createUpdateSchema(profileGoals);

export const publicOAuthStatesRowSchema = createSelectSchema(oauthStates);
export const publicOAuthStatesInsertSchema = createInsertSchema(oauthStates);
export const publicOAuthStatesUpdateSchema = createUpdateSchema(oauthStates);

export const publicIntegrationResourceLinksRowSchema = createSelectSchema(integrationResourceLinks);
export const publicIntegrationResourceLinksInsertSchema = createInsertSchema(
  integrationResourceLinks,
);
export const publicIntegrationResourceLinksUpdateSchema = createUpdateSchema(
  integrationResourceLinks,
);

export const publicLikesRowSchema = createSelectSchema(likes);
export const publicLikesInsertSchema = createInsertSchema(likes);
export const publicLikesUpdateSchema = createUpdateSchema(likes);

export const publicNotificationsRowSchema = createSelectSchema(notifications);
export const publicNotificationsInsertSchema = createInsertSchema(notifications);
export const publicNotificationsUpdateSchema = createUpdateSchema(notifications);

export const publicConversationsRowSchema = createSelectSchema(conversations);
export const publicConversationsInsertSchema = createInsertSchema(conversations);
export const publicConversationsUpdateSchema = createUpdateSchema(conversations);

export const publicConversationParticipantsRowSchema = createSelectSchema(conversationParticipants);
export const publicConversationParticipantsInsertSchema =
  createInsertSchema(conversationParticipants);
export const publicConversationParticipantsUpdateSchema =
  createUpdateSchema(conversationParticipants);

export const publicMessagesRowSchema = createSelectSchema(messages);
export const publicMessagesInsertSchema = createInsertSchema(messages);
export const publicMessagesUpdateSchema = createUpdateSchema(messages);

export const publicFollowsRowSchema = createSelectSchema(follows);
export const publicFollowsInsertSchema = createInsertSchema(follows);
export const publicFollowsUpdateSchema = createUpdateSchema(follows);

export const publicCommentsRowSchema = createSelectSchema(comments);
export const publicCommentsInsertSchema = createInsertSchema(comments);
export const publicCommentsUpdateSchema = createUpdateSchema(comments);

export type PublicActivityCategory = z.infer<typeof publicActivityCategorySchema>;
export type PublicEffortType = z.infer<typeof publicEffortTypeSchema>;
export type PublicEventStatus = z.infer<typeof publicEventStatusSchema>;
export type PublicEventType = z.infer<typeof publicEventTypeSchema>;
export type PublicGender = z.infer<typeof publicGenderSchema>;
export type PublicIntegrationResourceKind = z.infer<typeof publicIntegrationResourceKindSchema>;
export type PublicIntegrationProvider = z.infer<typeof publicIntegrationProviderSchema>;
export type PublicNotificationType = z.infer<typeof publicNotificationTypeSchema>;
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
export type PublicTrainingPlansRow = z.infer<typeof publicTrainingPlansRowSchema>;
export type PublicTrainingPlansInsert = z.infer<typeof publicTrainingPlansInsertSchema>;
export type PublicTrainingPlansUpdate = z.infer<typeof publicTrainingPlansUpdateSchema>;
export type PublicEventsRow = z.infer<typeof publicEventsRowSchema>;
export type PublicEventsInsert = z.infer<typeof publicEventsInsertSchema>;
export type PublicEventsUpdate = z.infer<typeof publicEventsUpdateSchema>;
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
export type PublicProviderSyncStateRow = z.infer<typeof publicProviderSyncStateRowSchema>;
export type PublicProviderSyncStateInsert = z.infer<typeof publicProviderSyncStateInsertSchema>;
export type PublicProviderSyncStateUpdate = z.infer<typeof publicProviderSyncStateUpdateSchema>;
export type PublicProviderSyncJobsRow = z.infer<typeof publicProviderSyncJobsRowSchema>;
export type PublicProviderSyncJobsInsert = z.infer<typeof publicProviderSyncJobsInsertSchema>;
export type PublicProviderSyncJobsUpdate = z.infer<typeof publicProviderSyncJobsUpdateSchema>;
export type PublicProviderWebhookReceiptsRow = z.infer<typeof publicProviderWebhookReceiptsRowSchema>;
export type PublicProviderWebhookReceiptsInsert = z.infer<typeof publicProviderWebhookReceiptsInsertSchema>;
export type PublicProviderWebhookReceiptsUpdate = z.infer<typeof publicProviderWebhookReceiptsUpdateSchema>;
export type PublicProfileMetricsRow = z.infer<typeof publicProfileMetricsRowSchema>;
export type PublicProfileMetricsInsert = z.infer<typeof publicProfileMetricsInsertSchema>;
export type PublicProfileMetricsUpdate = z.infer<typeof publicProfileMetricsUpdateSchema>;
export type PublicProfileTrainingSettingsRow = z.infer<
  typeof publicProfileTrainingSettingsRowSchema
>;
export type PublicProfileTrainingSettingsInsert = z.infer<
  typeof publicProfileTrainingSettingsInsertSchema
>;
export type PublicProfileTrainingSettingsUpdate = z.infer<
  typeof publicProfileTrainingSettingsUpdateSchema
>;
export type PublicProfileGoalsRow = z.infer<typeof publicProfileGoalsRowSchema>;
export type PublicProfileGoalsInsert = z.infer<typeof publicProfileGoalsInsertSchema>;
export type PublicProfileGoalsUpdate = z.infer<typeof publicProfileGoalsUpdateSchema>;
export type PublicOAuthStatesRow = z.infer<typeof publicOAuthStatesRowSchema>;
export type PublicOAuthStatesInsert = z.infer<typeof publicOAuthStatesInsertSchema>;
export type PublicOAuthStatesUpdate = z.infer<typeof publicOAuthStatesUpdateSchema>;
export type PublicIntegrationResourceLinksRow = z.infer<
  typeof publicIntegrationResourceLinksRowSchema
>;
export type PublicIntegrationResourceLinksInsert = z.infer<
  typeof publicIntegrationResourceLinksInsertSchema
>;
export type PublicIntegrationResourceLinksUpdate = z.infer<
  typeof publicIntegrationResourceLinksUpdateSchema
>;
export type PublicLikesRow = z.infer<typeof publicLikesRowSchema>;
export type PublicLikesInsert = z.infer<typeof publicLikesInsertSchema>;
export type PublicLikesUpdate = z.infer<typeof publicLikesUpdateSchema>;
export type PublicNotificationsRow = z.infer<typeof publicNotificationsRowSchema>;
export type PublicNotificationsInsert = z.infer<typeof publicNotificationsInsertSchema>;
export type PublicNotificationsUpdate = z.infer<typeof publicNotificationsUpdateSchema>;
export type PublicConversationsRow = z.infer<typeof publicConversationsRowSchema>;
export type PublicConversationsInsert = z.infer<typeof publicConversationsInsertSchema>;
export type PublicConversationsUpdate = z.infer<typeof publicConversationsUpdateSchema>;
export type PublicConversationParticipantsRow = z.infer<
  typeof publicConversationParticipantsRowSchema
>;
export type PublicConversationParticipantsInsert = z.infer<
  typeof publicConversationParticipantsInsertSchema
>;
export type PublicConversationParticipantsUpdate = z.infer<
  typeof publicConversationParticipantsUpdateSchema
>;
export type PublicMessagesRow = z.infer<typeof publicMessagesRowSchema>;
export type PublicMessagesInsert = z.infer<typeof publicMessagesInsertSchema>;
export type PublicMessagesUpdate = z.infer<typeof publicMessagesUpdateSchema>;
export type PublicFollowsRow = z.infer<typeof publicFollowsRowSchema>;
export type PublicFollowsInsert = z.infer<typeof publicFollowsInsertSchema>;
export type PublicFollowsUpdate = z.infer<typeof publicFollowsUpdateSchema>;
export type PublicCommentsRow = z.infer<typeof publicCommentsRowSchema>;
export type PublicCommentsInsert = z.infer<typeof publicCommentsInsertSchema>;
export type PublicCommentsUpdate = z.infer<typeof publicCommentsUpdateSchema>;
