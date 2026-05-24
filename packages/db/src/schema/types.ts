import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import type {
  activities,
  activityEfforts,
  activityGeometry,
  activityImports,
  activityLaps,
  activityPlanDerivedMetricsCache,
  activityPlanRefreshQueue,
  activityPlans,
  activityRoutes,
  activitySummaries,
  coachesAthletes,
  coachingInvitations,
  comments,
  contentAccessGrants,
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
  profileEstimationState,
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

export type ProfileRow = InferSelectModel<typeof profiles>;
export type ProfileInsert = InferInsertModel<typeof profiles>;

export type GroupRow = InferSelectModel<typeof groups>;
export type GroupInsert = InferInsertModel<typeof groups>;

export type GroupMembershipRow = InferSelectModel<typeof groupMemberships>;
export type GroupMembershipInsert = InferInsertModel<typeof groupMemberships>;

export type GroupInvitationRow = InferSelectModel<typeof groupInvitations>;
export type GroupInvitationInsert = InferInsertModel<typeof groupInvitations>;

export type GroupJoinRequestRow = InferSelectModel<typeof groupJoinRequests>;
export type GroupJoinRequestInsert = InferInsertModel<typeof groupJoinRequests>;

export type GroupEventRow = InferSelectModel<typeof groupEvents>;
export type GroupEventInsert = InferInsertModel<typeof groupEvents>;

export type GroupEventActivityPlanRow = InferSelectModel<typeof groupEventActivityPlans>;
export type GroupEventActivityPlanInsert = InferInsertModel<typeof groupEventActivityPlans>;

export type GroupEventRsvpRow = InferSelectModel<typeof groupEventRsvps>;
export type GroupEventRsvpInsert = InferInsertModel<typeof groupEventRsvps>;

export type GroupEventSeriesRsvpRow = InferSelectModel<typeof groupEventSeriesRsvps>;
export type GroupEventSeriesRsvpInsert = InferInsertModel<typeof groupEventSeriesRsvps>;

export type ActivityRouteRow = InferSelectModel<typeof activityRoutes>;
export type ActivityRouteInsert = InferInsertModel<typeof activityRoutes>;

export type CoachingInvitationRow = InferSelectModel<typeof coachingInvitations>;
export type CoachingInvitationInsert = InferInsertModel<typeof coachingInvitations>;

export type CoachAthleteRow = InferSelectModel<typeof coachesAthletes>;
export type CoachAthleteInsert = InferInsertModel<typeof coachesAthletes>;

export type ActivityPlanRow = InferSelectModel<typeof activityPlans>;
export type ActivityPlanInsert = InferInsertModel<typeof activityPlans>;

export type ActivityPlanDerivedMetricsCacheRow = InferSelectModel<
  typeof activityPlanDerivedMetricsCache
>;
export type ActivityPlanDerivedMetricsCacheInsert = InferInsertModel<
  typeof activityPlanDerivedMetricsCache
>;

export type ActivityPlanRefreshQueueRow = InferSelectModel<typeof activityPlanRefreshQueue>;
export type ActivityPlanRefreshQueueInsert = InferInsertModel<typeof activityPlanRefreshQueue>;

export type TrainingPlanRow = InferSelectModel<typeof trainingPlans>;
export type TrainingPlanInsert = InferInsertModel<typeof trainingPlans>;

export type UserTrainingPlanRow = InferSelectModel<typeof userTrainingPlans>;
export type UserTrainingPlanInsert = InferInsertModel<typeof userTrainingPlans>;

type BaseActivityRow = InferSelectModel<typeof activities>;
export type ActivityInsert = InferInsertModel<typeof activities>;

export type ActivitySummaryRow = InferSelectModel<typeof activitySummaries>;
export type ActivitySummaryInsert = InferInsertModel<typeof activitySummaries>;

export type ActivityImportRow = InferSelectModel<typeof activityImports>;
export type ActivityImportInsert = InferInsertModel<typeof activityImports>;

export type ActivityGeometryRow = InferSelectModel<typeof activityGeometry>;
export type ActivityGeometryInsert = InferInsertModel<typeof activityGeometry>;

export type ActivityLapRow = InferSelectModel<typeof activityLaps>;
export type ActivityLapInsert = InferInsertModel<typeof activityLaps>;

type BaseEventRow = InferSelectModel<typeof events>;
export type EventInsert = InferInsertModel<typeof events>;

export type EventScheduleLinkRow = InferSelectModel<typeof eventScheduleLinks>;
export type EventScheduleLinkInsert = InferInsertModel<typeof eventScheduleLinks>;

export type EventExternalLinkRow = InferSelectModel<typeof eventExternalLinks>;
export type EventExternalLinkInsert = InferInsertModel<typeof eventExternalLinks>;

export type EventRecurrenceRow = InferSelectModel<typeof eventRecurrence>;
export type EventRecurrenceInsert = InferInsertModel<typeof eventRecurrence>;

export type EventPayloadRow = InferSelectModel<typeof eventPayloads>;
export type EventPayloadInsert = InferInsertModel<typeof eventPayloads>;

export type ActivityRow = BaseActivityRow &
  Partial<
    Pick<
      ActivitySummaryRow,
      | "avg_cadence"
      | "avg_heart_rate"
      | "avg_power"
      | "avg_speed_mps"
      | "calories"
      | "distance_meters"
      | "duration_seconds"
      | "max_cadence"
      | "max_heart_rate"
      | "max_power"
      | "max_speed_mps"
      | "moving_seconds"
      | "normalized_graded_speed_mps"
      | "normalized_power"
      | "normalized_speed_mps"
    >
  > &
  Partial<Pick<ActivityImportRow, "activity_file_path">> &
  Partial<Pick<ActivityGeometryRow, "map_bounds" | "polyline">>;

export type EventRow = BaseEventRow &
  Partial<
    Pick<
      EventScheduleLinkRow,
      | "activity_plan_id"
      | "linked_activity_id"
      | "route_id"
      | "schedule_batch_id"
      | "training_plan_id"
      | "user_training_plan_id"
    >
  > &
  Partial<
    Pick<
      EventExternalLinkRow,
      "external_calendar_id" | "external_event_id" | "integration_account_id" | "source_provider"
    >
  > &
  Partial<
    Pick<
      EventRecurrenceRow,
      | "occurrence_key"
      | "original_starts_at"
      | "recurrence"
      | "recurrence_rule"
      | "recurrence_timezone"
      | "series_id"
    >
  >;

export type ContentAccessGrantRow = InferSelectModel<typeof contentAccessGrants>;
export type ContentAccessGrantInsert = InferInsertModel<typeof contentAccessGrants>;

export type ActivityEffortRow = InferSelectModel<typeof activityEfforts>;
export type ActivityEffortInsert = InferInsertModel<typeof activityEfforts>;

export type IntegrationRow = InferSelectModel<typeof integrations>;
export type IntegrationInsert = InferInsertModel<typeof integrations>;

export type IntegrationCredentialRow = InferSelectModel<typeof integrationCredentials>;
export type IntegrationCredentialInsert = InferInsertModel<typeof integrationCredentials>;

export type ProviderSyncStateRow = InferSelectModel<typeof providerSyncState>;
export type ProviderSyncStateInsert = InferInsertModel<typeof providerSyncState>;

export type ProviderSyncJobRow = InferSelectModel<typeof providerSyncJobs>;
export type ProviderSyncJobInsert = InferInsertModel<typeof providerSyncJobs>;

export type ProviderWebhookReceiptRow = InferSelectModel<typeof providerWebhookReceipts>;
export type ProviderWebhookReceiptInsert = InferInsertModel<typeof providerWebhookReceipts>;

export type ProfileMetricRow = InferSelectModel<typeof profileMetrics>;
export type ProfileMetricInsert = InferInsertModel<typeof profileMetrics>;

export type ProfileEstimationStateRow = InferSelectModel<typeof profileEstimationState>;
export type ProfileEstimationStateInsert = InferInsertModel<typeof profileEstimationState>;

export type ProfileTrainingSettingsRow = InferSelectModel<typeof profileTrainingSettings>;
export type ProfileTrainingSettingsInsert = InferInsertModel<typeof profileTrainingSettings>;

export type ProfileGoalRow = InferSelectModel<typeof profileGoals>;
export type ProfileGoalInsert = InferInsertModel<typeof profileGoals>;

export type OAuthStateRow = InferSelectModel<typeof oauthStates>;
export type OAuthStateInsert = InferInsertModel<typeof oauthStates>;

export type IntegrationResourceLinkRow = InferSelectModel<typeof integrationResourceLinks>;
export type IntegrationResourceLinkInsert = InferInsertModel<typeof integrationResourceLinks>;

export type LikeRow = InferSelectModel<typeof likes>;
export type LikeInsert = InferInsertModel<typeof likes>;

export type NotificationRow = InferSelectModel<typeof notifications>;
export type NotificationInsert = InferInsertModel<typeof notifications>;

export type ConversationRow = InferSelectModel<typeof conversations>;
export type ConversationInsert = InferInsertModel<typeof conversations>;

export type ConversationParticipantRow = InferSelectModel<typeof conversationParticipants>;
export type ConversationParticipantInsert = InferInsertModel<typeof conversationParticipants>;

export type MessageRow = InferSelectModel<typeof messages>;
export type MessageInsert = InferInsertModel<typeof messages>;

export type FollowRow = InferSelectModel<typeof follows>;
export type FollowInsert = InferInsertModel<typeof follows>;

export type CommentRow = InferSelectModel<typeof comments>;
export type CommentInsert = InferInsertModel<typeof comments>;
