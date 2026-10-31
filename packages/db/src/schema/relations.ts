import { relations } from "drizzle-orm";

import {
  activities,
  activityAnalysisRevisions,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityFileIngestions,
  activityImportRuns,
  activityPlans,
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
  trainingPlanApplicationCommandReceipts,
  trainingPlanApplications,
  trainingPlans,
} from "./tables";

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  activities: many(activities),
  activityAnalysisRevisions: many(activityAnalysisRevisions),
  activityArtifacts: many(activityArtifacts),
  activitySegments: many(activitySegments),
  activityFileIngestions: many(activityFileIngestions),
  activityTrainingEffects: many(activityTrainingEffects),
  dailyTrainingLoad: many(dailyTrainingLoad),
  athleteRecalculationQueue: one(athleteRecalculationQueue),
  thresholdEvidence: many(thresholdEvidence),
  plannedSessions: many(plannedSessions),
  trainingPlanApplications: many(trainingPlanApplications),
  trainingPlanApplicationCommandReceipts: many(trainingPlanApplicationCommandReceipts),
  activitySessionRpeEvidence: many(activitySessionRpeEvidence),
  manualTrainingDiaryOperations: many(manualTrainingDiaryOperations),
  activityPlans: many(activityPlans),
  activityRoutes: many(activityRoutes),
  conversationParticipants: many(conversationParticipants),
  conversationsStarted: many(messages, { relationName: "messageSender" }),
  events: many(events),
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
  organizationsCreated: many(organizations, { relationName: "organizationCreator" }),
  organizationMemberships: many(organizationMemberships),
  coachingEngagements: many(coachingEngagements),
  profileGoals: many(profileGoals),
  profileMetrics: many(profileMetrics),
  athleteState: one(profileAthleteState),
  performanceEstimates: many(profilePerformanceEstimates),
  thresholdEvaluations: many(thresholdEvaluations),
  thresholds: many(thresholds),
  activityImportRuns: many(activityImportRuns),
  activitySourceReferences: many(activitySourceReferences),
  providerSyncJobs: many(providerSyncJobs),
  providerWebhookReceipts: many(providerWebhookReceipts),
  integrationResourceLinks: many(integrationResourceLinks),
  trainingPlans: many(trainingPlans),
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

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  createdByProfile: one(profiles, {
    relationName: "organizationCreator",
    fields: [organizations.created_by_profile_id],
    references: [profiles.id],
  }),
  memberships: many(organizationMemberships),
  coachingEngagements: many(coachingEngagements),
  coachingAssignments: many(coachingAssignments),
  auditEvents: many(organizationAuditEvents),
}));

export const organizationMembershipsRelations = relations(
  organizationMemberships,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [organizationMemberships.organization_id],
      references: [organizations.id],
    }),
    profile: one(profiles, {
      fields: [organizationMemberships.profile_id],
      references: [profiles.id],
    }),
    roleGrants: many(organizationMembershipRoleGrants),
    coachingAssignments: many(coachingAssignments),
  }),
);

export const coachingEngagementsRelations = relations(coachingEngagements, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [coachingEngagements.organization_id],
    references: [organizations.id],
  }),
  athleteProfile: one(profiles, {
    fields: [coachingEngagements.athlete_profile_id],
    references: [profiles.id],
  }),
  assignments: many(coachingAssignments),
  consents: many(athleteDataSharingConsents),
}));

export const coachingAssignmentsRelations = relations(coachingAssignments, ({ one }) => ({
  engagement: one(coachingEngagements, {
    fields: [coachingAssignments.engagement_id],
    references: [coachingEngagements.id],
  }),
  coachMembership: one(organizationMemberships, {
    fields: [coachingAssignments.coach_membership_id],
    references: [organizationMemberships.id],
  }),
}));

export const athleteConsentPolicyVersionsRelations = relations(
  athleteConsentPolicyVersions,
  ({ many }) => ({ consents: many(athleteDataSharingConsents) }),
);

export const athleteDataSharingConsentsRelations = relations(
  athleteDataSharingConsents,
  ({ one }) => ({
    engagement: one(coachingEngagements, {
      fields: [athleteDataSharingConsents.engagement_id],
      references: [coachingEngagements.id],
    }),
    policyVersion: one(athleteConsentPolicyVersions, {
      fields: [athleteDataSharingConsents.policy_version_id],
      references: [athleteConsentPolicyVersions.id],
    }),
  }),
);

export const organizationAuditEventsRelations = relations(organizationAuditEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationAuditEvents.organization_id],
    references: [organizations.id],
  }),
  actorProfile: one(profiles, {
    fields: [organizationAuditEvents.actor_profile_id],
    references: [profiles.id],
  }),
  actorMembership: one(organizationMemberships, {
    fields: [organizationAuditEvents.actor_membership_id],
    references: [organizationMemberships.id],
  }),
}));

export const organizationMembershipRoleGrantsRelations = relations(
  organizationMembershipRoleGrants,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembershipRoleGrants.organization_id],
      references: [organizations.id],
    }),
    membership: one(organizationMemberships, {
      fields: [organizationMembershipRoleGrants.membership_id],
      references: [organizationMemberships.id],
    }),
  }),
);

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
  activityPlan: one(activityPlans, {
    fields: [groupEvents.activity_plan_id],
    references: [activityPlans.id],
  }),
  rsvps: many(groupEventRsvps),
  seriesRsvps: many(groupEventSeriesRsvps),
  plannedSessions: many(plannedSessions),
}));

export const groupEventRsvpsRelations = relations(groupEventRsvps, ({ one }) => ({
  groupEvent: one(groupEvents, {
    fields: [groupEventRsvps.group_event_id],
    references: [groupEvents.id],
  }),
  profile: one(profiles, {
    fields: [groupEventRsvps.profile_id],
    references: [profiles.id],
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
  events: many(events),
  groupEvents: many(groupEvents),
  activities: many(activities),
}));

export const activityPlansRelations = relations(activityPlans, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityPlans.profile_id],
    references: [profiles.id],
  }),
  activities: many(activities),
  groupEvents: many(groupEvents),
  plannedSessions: many(plannedSessions),
}));

export const trainingPlansRelations = relations(trainingPlans, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [trainingPlans.profile_id],
    references: [profiles.id],
  }),
  plannedSessions: many(plannedSessions),
}));

export const profileAthleteStateRelations = relations(profileAthleteState, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileAthleteState.profile_id],
    references: [profiles.id],
  }),
}));

export const dailyTrainingLoadRelations = relations(dailyTrainingLoad, ({ one }) => ({
  profile: one(profiles, {
    fields: [dailyTrainingLoad.profile_id],
    references: [profiles.id],
  }),
}));

export const athleteRecalculationQueueRelations = relations(
  athleteRecalculationQueue,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [athleteRecalculationQueue.profile_id],
      references: [profiles.id],
    }),
  }),
);

export const profilePerformanceEstimatesRelations = relations(
  profilePerformanceEstimates,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [profilePerformanceEstimates.profile_id],
      references: [profiles.id],
    }),
  }),
);

export const thresholdEvaluationsRelations = relations(thresholdEvaluations, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [thresholdEvaluations.profile_id],
    references: [profiles.id],
  }),
  sourceActivity: one(activities, {
    fields: [thresholdEvaluations.source_activity_id, thresholdEvaluations.profile_id],
    references: [activities.id, activities.profile_id],
  }),
  efforts: many(thresholdEvaluationEfforts),
  threshold: one(thresholds),
}));

export const thresholdEvaluationEffortsRelations = relations(
  thresholdEvaluationEfforts,
  ({ one }) => ({
    evaluation: one(thresholdEvaluations, {
      fields: [
        thresholdEvaluationEfforts.evaluation_id,
        thresholdEvaluationEfforts.profile_id,
        thresholdEvaluationEfforts.activity_category,
        thresholdEvaluationEfforts.metric,
      ],
      references: [
        thresholdEvaluations.id,
        thresholdEvaluations.profile_id,
        thresholdEvaluations.activity_category,
        thresholdEvaluations.metric,
      ],
    }),
    effort: one(activityEfforts, {
      fields: [thresholdEvaluationEfforts.effort_id],
      references: [activityEfforts.id],
    }),
    profile: one(profiles, {
      fields: [thresholdEvaluationEfforts.profile_id],
      references: [profiles.id],
    }),
    activity: one(activities, {
      fields: [thresholdEvaluationEfforts.activity_id],
      references: [activities.id],
    }),
  }),
);

export const thresholdsRelations = relations(thresholds, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [thresholds.profile_id],
    references: [profiles.id],
  }),
  evaluation: one(thresholdEvaluations, {
    fields: [thresholds.evaluation_id],
    references: [thresholdEvaluations.id],
  }),
  supersedes: one(thresholds, {
    relationName: "thresholdSupersession",
    fields: [thresholds.supersedes_id],
    references: [thresholds.id],
  }),
  supersededBy: many(thresholds, {
    relationName: "thresholdSupersession",
  }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [events.profile_id],
    references: [profiles.id],
  }),
  integrationResourceLinks: many(integrationResourceLinks, {
    relationName: "eventIntegrationResourceLinks",
  }),
  linkedActivity: one(activities, {
    fields: [events.linked_activity_id],
    references: [activities.id],
  }),
  route: one(activityRoutes, {
    fields: [events.route_id],
    references: [activityRoutes.id],
  }),
  series: one(events, {
    relationName: "eventRecurrenceSeriesOccurrences",
    fields: [events.series_id],
    references: [events.id],
  }),
  recurrenceOccurrences: many(events, {
    relationName: "eventRecurrenceSeriesOccurrences",
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
  route: one(activityRoutes, {
    fields: [activities.route_id],
    references: [activityRoutes.id],
  }),
  efforts: many(activityEfforts),
  sessionRpeEvidence: many(activitySessionRpeEvidence),
  fileIngestions: many(activityFileIngestions),
  artifactLinks: many(activityArtifactLinks),
  sourceReferences: many(activitySourceReferences),
  segments: many(activitySegments),
  thresholdEvaluations: many(thresholdEvaluations),
  thresholdEvaluationEfforts: many(thresholdEvaluationEfforts),
  analysisRevisions: many(activityAnalysisRevisions),
  trainingEffects: many(activityTrainingEffects),
  thresholdEvidence: many(thresholdEvidence),
  completedPlannedSessions: many(plannedSessions),
  manualDiaryOperations: many(manualTrainingDiaryOperations),
  supersedingManualActivities: many(activities, { relationName: "activitySupersession" }),
  reconciledPlannedSession: one(plannedSessions, {
    fields: [activities.reconciled_planned_session_id, activities.profile_id],
    references: [plannedSessions.id, plannedSessions.profile_id],
    relationName: "manualActivityReconciledSession",
  }),
  supersededByActivity: one(activities, {
    fields: [activities.superseded_by_activity_id, activities.profile_id],
    references: [activities.id, activities.profile_id],
    relationName: "activitySupersession",
  }),
}));

export const activityAnalysisRevisionsRelations = relations(
  activityAnalysisRevisions,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activityAnalysisRevisions.activity_id, activityAnalysisRevisions.profile_id],
      references: [activities.id, activities.profile_id],
    }),
    profile: one(profiles, {
      fields: [activityAnalysisRevisions.profile_id],
      references: [profiles.id],
    }),
    trainingEffect: one(activityTrainingEffects),
  }),
);

export const activityTrainingEffectsRelations = relations(activityTrainingEffects, ({ one }) => ({
  profile: one(profiles, {
    fields: [activityTrainingEffects.profile_id],
    references: [profiles.id],
  }),
  activity: one(activities, {
    fields: [activityTrainingEffects.activity_id],
    references: [activities.id],
  }),
  analysisRevision: one(activityAnalysisRevisions, {
    fields: [
      activityTrainingEffects.activity_id,
      activityTrainingEffects.profile_id,
      activityTrainingEffects.activity_analysis_revision,
    ],
    references: [
      activityAnalysisRevisions.activity_id,
      activityAnalysisRevisions.profile_id,
      activityAnalysisRevisions.revision,
    ],
  }),
}));

export const thresholdEvidenceRelations = relations(thresholdEvidence, ({ one }) => ({
  profile: one(profiles, {
    fields: [thresholdEvidence.profile_id],
    references: [profiles.id],
  }),
  activity: one(activities, {
    fields: [thresholdEvidence.activity_id, thresholdEvidence.profile_id],
    references: [activities.id, activities.profile_id],
  }),
}));

export const activityArtifactsRelations = relations(activityArtifacts, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityArtifacts.profile_id],
    references: [profiles.id],
  }),
  links: many(activityArtifactLinks),
  ingestions: many(activityFileIngestions),
  sourcedSegments: many(activitySegments),
  sourcedEfforts: many(activityEfforts),
}));

export const activityArtifactLinksRelations = relations(activityArtifactLinks, ({ one }) => ({
  activity: one(activities, {
    fields: [activityArtifactLinks.activity_id],
    references: [activities.id],
  }),
  artifact: one(activityArtifacts, {
    fields: [activityArtifactLinks.artifact_id],
    references: [activityArtifacts.id],
  }),
  profile: one(profiles, {
    fields: [activityArtifactLinks.profile_id],
    references: [profiles.id],
  }),
}));

export const activitySegmentsRelations = relations(activitySegments, ({ one, many }) => ({
  activity: one(activities, {
    fields: [activitySegments.activity_id],
    references: [activities.id],
  }),
  profile: one(profiles, {
    fields: [activitySegments.profile_id],
    references: [profiles.id],
  }),
  sourceArtifact: one(activityArtifacts, {
    fields: [activitySegments.source_artifact_id],
    references: [activityArtifacts.id],
  }),
  efforts: many(activityEfforts),
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
  artifact: one(activityArtifacts, {
    fields: [activityFileIngestions.artifact_id],
    references: [activityArtifacts.id],
  }),
}));

export const plannedSessionsRelations = relations(plannedSessions, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [plannedSessions.profile_id],
    references: [profiles.id],
  }),
  trainingPlan: one(trainingPlans, {
    fields: [plannedSessions.training_plan_id],
    references: [trainingPlans.id],
  }),
  trainingPlanApplication: one(trainingPlanApplications, {
    fields: [plannedSessions.training_plan_application_id],
    references: [trainingPlanApplications.id],
  }),
  activityPlan: one(activityPlans, {
    fields: [plannedSessions.activity_plan_id],
    references: [activityPlans.id],
  }),
  groupEvent: one(groupEvents, {
    fields: [plannedSessions.group_event_id],
    references: [groupEvents.id],
  }),
  completedActivity: one(activities, {
    fields: [plannedSessions.completed_activity_id, plannedSessions.profile_id],
    references: [activities.id, activities.profile_id],
  }),
  reconciledManualActivities: many(activities, { relationName: "manualActivityReconciledSession" }),
}));

export const trainingPlanApplicationsRelations = relations(
  trainingPlanApplications,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [trainingPlanApplications.profile_id],
      references: [profiles.id],
    }),
    trainingPlan: one(trainingPlans, {
      fields: [trainingPlanApplications.training_plan_id],
      references: [trainingPlans.id],
    }),
    plannedSessions: many(plannedSessions),
    commandReceipts: many(trainingPlanApplicationCommandReceipts),
  }),
);

export const trainingPlanApplicationCommandReceiptsRelations = relations(
  trainingPlanApplicationCommandReceipts,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [trainingPlanApplicationCommandReceipts.profile_id],
      references: [profiles.id],
    }),
    application: one(trainingPlanApplications, {
      fields: [trainingPlanApplicationCommandReceipts.application_id],
      references: [trainingPlanApplications.id],
    }),
  }),
);

export const manualTrainingDiaryOperationsRelations = relations(
  manualTrainingDiaryOperations,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [manualTrainingDiaryOperations.profile_id],
      references: [profiles.id],
    }),
    activity: one(activities, {
      fields: [manualTrainingDiaryOperations.activity_id, manualTrainingDiaryOperations.profile_id],
      references: [activities.id, activities.profile_id],
    }),
    plannedSession: one(plannedSessions, {
      fields: [
        manualTrainingDiaryOperations.planned_session_id,
        manualTrainingDiaryOperations.profile_id,
      ],
      references: [plannedSessions.id, plannedSessions.profile_id],
    }),
  }),
);

export const activityEffortsRelations = relations(activityEfforts, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityEfforts.profile_id],
    references: [profiles.id],
  }),
  activity: one(activities, {
    fields: [activityEfforts.activity_id],
    references: [activities.id],
  }),
  segment: one(activitySegments, {
    fields: [activityEfforts.segment_id],
    references: [activitySegments.id],
  }),
  sourceArtifact: one(activityArtifacts, {
    fields: [activityEfforts.source_artifact_id],
    references: [activityArtifacts.id],
  }),
  thresholdEvaluationLinks: many(thresholdEvaluationEfforts),
}));

export const activitySessionRpeEvidenceRelations = relations(
  activitySessionRpeEvidence,
  ({ one }) => ({
    profile: one(profiles, {
      fields: [activitySessionRpeEvidence.profile_id],
      references: [profiles.id],
    }),
    activity: one(activities, {
      fields: [activitySessionRpeEvidence.activity_id],
      references: [activities.id],
    }),
    correctionOf: one(activitySessionRpeEvidence, {
      fields: [activitySessionRpeEvidence.correction_of_id],
      references: [activitySessionRpeEvidence.id],
      relationName: "activitySessionRpeEvidenceCorrections",
    }),
  }),
);

export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [integrations.profile_id],
    references: [profiles.id],
  }),
  credentials: one(integrationCredentials, {
    fields: [integrations.id],
    references: [integrationCredentials.integration_id],
  }),
  events: many(events),
  resourceLinks: many(integrationResourceLinks),
  activityImportRuns: many(activityImportRuns),
  activitySourceReferences: many(activitySourceReferences),
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
  importRun: one(activityImportRuns, {
    fields: [providerSyncJobs.import_run_id, providerSyncJobs.profile_id],
    references: [activityImportRuns.id, activityImportRuns.profile_id],
  }),
}));

export const activityImportRunsRelations = relations(activityImportRuns, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [activityImportRuns.profile_id],
    references: [profiles.id],
  }),
  integration: one(integrations, {
    fields: [activityImportRuns.integration_id, activityImportRuns.profile_id],
    references: [integrations.id, integrations.profile_id],
  }),
  sourceReferences: many(activitySourceReferences),
  syncJobs: many(providerSyncJobs),
}));

export const activitySourceReferencesRelations = relations(activitySourceReferences, ({ one }) => ({
  profile: one(profiles, {
    fields: [activitySourceReferences.profile_id],
    references: [profiles.id],
  }),
  activity: one(activities, {
    fields: [activitySourceReferences.activity_id],
    references: [activities.id],
  }),
  integration: one(integrations, {
    fields: [activitySourceReferences.integration_id, activitySourceReferences.profile_id],
    references: [integrations.id, integrations.profile_id],
  }),
  lastImportRun: one(activityImportRuns, {
    fields: [activitySourceReferences.last_import_run_id, activitySourceReferences.profile_id],
    references: [activityImportRuns.id, activityImportRuns.profile_id],
  }),
  lastMaterialImportRun: one(activityImportRuns, {
    fields: [
      activitySourceReferences.last_material_import_run_id,
      activitySourceReferences.profile_id,
    ],
    references: [activityImportRuns.id, activityImportRuns.profile_id],
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
  plannedSession: one(plannedSessions, {
    relationName: "plannedSessionIntegrationResourceLinks",
    fields: [integrationResourceLinks.internal_resource_id],
    references: [plannedSessions.id],
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
  organizationsRelations,
  organizationMembershipsRelations,
  organizationMembershipRoleGrantsRelations,
  coachingEngagementsRelations,
  coachingAssignmentsRelations,
  athleteConsentPolicyVersionsRelations,
  athleteDataSharingConsentsRelations,
  organizationAuditEventsRelations,
  groupInvitationsRelations,
  groupJoinRequestsRelations,
  groupEventsRelations,
  groupEventRsvpsRelations,
  activityRoutesRelations,
  activityPlansRelations,
  activityImportRunsRelations,
  activitySourceReferencesRelations,
  trainingPlansRelations,
  trainingPlanApplicationsRelations,
  trainingPlanApplicationCommandReceiptsRelations,
  plannedSessionsRelations,
  eventsRelations,
  activitiesRelations,
  activityAnalysisRevisionsRelations,
  activityTrainingEffectsRelations,
  activityArtifactLinksRelations,
  activityArtifactsRelations,
  activityFileIngestionsRelations,
  activityEffortsRelations,
  activitySessionRpeEvidenceRelations,
  activitySegmentsRelations,
  thresholdEvaluationsRelations,
  thresholdEvaluationEffortsRelations,
  thresholdsRelations,
  thresholdEvidenceRelations,
  integrationsRelations,
  integrationCredentialsRelations,
  providerSyncJobsRelations,
  providerSyncStateRelations,
  providerWebhookReceiptsRelations,
  profileGoalsRelations,
  profileMetricsRelations,
  profileAthleteStateRelations,
  dailyTrainingLoadRelations,
  athleteRecalculationQueueRelations,
  profilePerformanceEstimatesRelations,
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
