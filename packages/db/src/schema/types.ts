import type { InferInsertModel, InferSelectModel, Table } from "drizzle-orm";

import type {
  activities,
  activityAnalysisRevisions,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityFileIngestions,
  activityImportRuns,
  activityPlans,
  activityRouteDeletionReceipts,
  activityRoutes,
  activitySegments,
  activitySessionRpeEvidence,
  activitySourceReferences,
  activityTrainingEffects,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  athleteRecalculationQueue,
  coachingAssignments,
  coachingEngagements,
  comments,
  contentAccessGrants,
  conversationParticipants,
  conversations,
  dailyTrainingLoad,
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
  manualTrainingDiaryOperations,
  messages,
  notifications,
  oauthStates,
  organizationAuditEvents,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  plannedSessions,
  profileAthleteState,
  profileGoals,
  profileMetrics,
  profilePerformanceEstimates,
  profiles,
  providerSyncJobs,
  providerSyncState,
  providerWebhookReceipts,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholdEvidence,
  thresholds,
  trainingPlans,
} from "./tables";

type InferUpdateModel<TTable extends Table> = {
  [Key in keyof InferInsertModel<TTable>]?: InferInsertModel<TTable>[Key] | undefined;
};

export type ProfileRow = InferSelectModel<typeof profiles>;
export type ProfileInsert = InferInsertModel<typeof profiles>;

export type GroupRow = InferSelectModel<typeof groups>;
export type GroupInsert = InferInsertModel<typeof groups>;

export type GroupMembershipRow = InferSelectModel<typeof groupMemberships>;
export type GroupMembershipInsert = InferInsertModel<typeof groupMemberships>;

export type OrganizationRow = InferSelectModel<typeof organizations>;
export type OrganizationInsert = InferInsertModel<typeof organizations>;

export type OrganizationMembershipRow = InferSelectModel<typeof organizationMemberships>;
export type OrganizationMembershipInsert = InferInsertModel<typeof organizationMemberships>;

export type OrganizationMembershipRoleGrantRow = InferSelectModel<
  typeof organizationMembershipRoleGrants
>;
export type OrganizationMembershipRoleGrantInsert = InferInsertModel<
  typeof organizationMembershipRoleGrants
>;

export type CoachingEngagementRow = InferSelectModel<typeof coachingEngagements>;
export type CoachingEngagementInsert = InferInsertModel<typeof coachingEngagements>;
export type CoachingAssignmentRow = InferSelectModel<typeof coachingAssignments>;
export type CoachingAssignmentInsert = InferInsertModel<typeof coachingAssignments>;
export type AthleteConsentPolicyVersionRow = InferSelectModel<typeof athleteConsentPolicyVersions>;
export type AthleteConsentPolicyVersionInsert = InferInsertModel<
  typeof athleteConsentPolicyVersions
>;
export type AthleteDataSharingConsentRow = InferSelectModel<typeof athleteDataSharingConsents>;
export type AthleteDataSharingConsentInsert = InferInsertModel<typeof athleteDataSharingConsents>;
export type OrganizationAuditEventRow = InferSelectModel<typeof organizationAuditEvents>;
export type OrganizationAuditEventInsert = InferInsertModel<typeof organizationAuditEvents>;

export type GroupInvitationRow = InferSelectModel<typeof groupInvitations>;
export type GroupInvitationInsert = InferInsertModel<typeof groupInvitations>;

export type GroupJoinRequestRow = InferSelectModel<typeof groupJoinRequests>;
export type GroupJoinRequestInsert = InferInsertModel<typeof groupJoinRequests>;

export type GroupEventRow = InferSelectModel<typeof groupEvents>;
export type GroupEventInsert = InferInsertModel<typeof groupEvents>;

export type GroupEventRsvpRow = InferSelectModel<typeof groupEventRsvps>;
export type GroupEventRsvpInsert = InferInsertModel<typeof groupEventRsvps>;

export type GroupEventSeriesRsvpRow = InferSelectModel<typeof groupEventSeriesRsvps>;
export type GroupEventSeriesRsvpInsert = InferInsertModel<typeof groupEventSeriesRsvps>;

export type ActivityRouteRow = InferSelectModel<typeof activityRoutes>;
export type ActivityRouteInsert = InferInsertModel<typeof activityRoutes>;
export type ActivityRouteDeletionReceiptRow = InferSelectModel<
  typeof activityRouteDeletionReceipts
>;
export type ActivityRouteDeletionReceiptInsert = InferInsertModel<
  typeof activityRouteDeletionReceipts
>;

export type ActivityPlanRow = InferSelectModel<typeof activityPlans>;
export type ActivityPlanInsert = InferInsertModel<typeof activityPlans>;

export type TrainingPlanRow = InferSelectModel<typeof trainingPlans>;
export type TrainingPlanInsert = InferInsertModel<typeof trainingPlans>;

export type ActivityRow = InferSelectModel<typeof activities>;
export type ActivityInsert = InferInsertModel<typeof activities>;
export type ManualTrainingDiaryOperationRow = InferSelectModel<
  typeof manualTrainingDiaryOperations
>;
export type ManualTrainingDiaryOperationInsert = InferInsertModel<
  typeof manualTrainingDiaryOperations
>;
export type ActivityAnalysisRevisionRow = InferSelectModel<typeof activityAnalysisRevisions>;
export type ActivityAnalysisRevisionInsert = InferInsertModel<typeof activityAnalysisRevisions>;
export type ActivityImportRunRow = InferSelectModel<typeof activityImportRuns>;
export type ActivityImportRunInsert = InferInsertModel<typeof activityImportRuns>;
export type ActivitySourceReferenceRow = InferSelectModel<typeof activitySourceReferences>;
export type ActivitySourceReferenceInsert = InferInsertModel<typeof activitySourceReferences>;

export type ActivityArtifactRow = InferSelectModel<typeof activityArtifacts>;
export type ActivityArtifactInsert = InferInsertModel<typeof activityArtifacts>;

export type ActivityArtifactLinkRow = InferSelectModel<typeof activityArtifactLinks>;
export type ActivityArtifactLinkInsert = InferInsertModel<typeof activityArtifactLinks>;

export type ActivitySegmentRow = InferSelectModel<typeof activitySegments>;
export type ActivitySegmentInsert = InferInsertModel<typeof activitySegments>;

export type ActivityFileIngestionRow = InferSelectModel<typeof activityFileIngestions>;
export type ActivityFileIngestionInsert = InferInsertModel<typeof activityFileIngestions>;
export type ActivityFileIngestionUpdate = InferUpdateModel<typeof activityFileIngestions>;
export type ActivityTrainingEffectRow = InferSelectModel<typeof activityTrainingEffects>;
export type ActivityTrainingEffectInsert = InferInsertModel<typeof activityTrainingEffects>;
export type ActivityTrainingEffectUpdate = InferUpdateModel<typeof activityTrainingEffects>;
export type DailyTrainingLoadRow = InferSelectModel<typeof dailyTrainingLoad>;
export type DailyTrainingLoadInsert = InferInsertModel<typeof dailyTrainingLoad>;
export type DailyTrainingLoadUpdate = InferUpdateModel<typeof dailyTrainingLoad>;
export type AthleteRecalculationQueueRow = InferSelectModel<typeof athleteRecalculationQueue>;
export type AthleteRecalculationQueueInsert = InferInsertModel<typeof athleteRecalculationQueue>;
export type AthleteRecalculationQueueUpdate = InferUpdateModel<typeof athleteRecalculationQueue>;
export type ThresholdEvidenceRow = InferSelectModel<typeof thresholdEvidence>;
export type ThresholdEvidenceInsert = InferInsertModel<typeof thresholdEvidence>;
export type ThresholdEvidenceUpdate = InferUpdateModel<typeof thresholdEvidence>;

export type EventRow = InferSelectModel<typeof events>;
export type EventInsert = InferInsertModel<typeof events>;
export type PlannedSessionRow = InferSelectModel<typeof plannedSessions>;
export type PlannedSessionInsert = InferInsertModel<typeof plannedSessions>;
export type PlannedSessionUpdate = InferUpdateModel<typeof plannedSessions>;

export type ContentAccessGrantRow = InferSelectModel<typeof contentAccessGrants>;
export type ContentAccessGrantInsert = InferInsertModel<typeof contentAccessGrants>;

export type ActivityEffortRow = InferSelectModel<typeof activityEfforts>;
export type ActivityEffortInsert = InferInsertModel<typeof activityEfforts>;

export type ActivitySessionRpeEvidenceRow = InferSelectModel<typeof activitySessionRpeEvidence>;
export type ActivitySessionRpeEvidenceInsert = InferInsertModel<typeof activitySessionRpeEvidence>;

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
export type ProfileAthleteStateRow = InferSelectModel<typeof profileAthleteState>;
export type ProfileAthleteStateInsert = InferInsertModel<typeof profileAthleteState>;
export type ProfileAthleteStateUpdate = InferUpdateModel<typeof profileAthleteState>;
export type ProfilePerformanceEstimateRow = InferSelectModel<typeof profilePerformanceEstimates>;
export type ProfilePerformanceEstimateInsert = InferInsertModel<typeof profilePerformanceEstimates>;
export type ThresholdEvaluationRow = InferSelectModel<typeof thresholdEvaluations>;
export type ThresholdEvaluationInsert = InferInsertModel<typeof thresholdEvaluations>;
export type ThresholdEvaluationEffortRow = InferSelectModel<typeof thresholdEvaluationEfforts>;
export type ThresholdEvaluationEffortInsert = InferInsertModel<typeof thresholdEvaluationEfforts>;
export type ThresholdRow = InferSelectModel<typeof thresholds>;
export type ThresholdInsert = InferInsertModel<typeof thresholds>;

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
