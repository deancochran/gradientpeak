import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

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
  userTrainingPlans,
} from "./tables";

export type ProfileRow = InferSelectModel<typeof profiles>;
export type ProfileInsert = InferInsertModel<typeof profiles>;

export type ActivityRouteRow = InferSelectModel<typeof activityRoutes>;
export type ActivityRouteInsert = InferInsertModel<typeof activityRoutes>;

export type ActivityPlanRow = InferSelectModel<typeof activityPlans>;
export type ActivityPlanInsert = InferInsertModel<typeof activityPlans>;

export type TrainingPlanRow = InferSelectModel<typeof trainingPlans>;
export type TrainingPlanInsert = InferInsertModel<typeof trainingPlans>;

export type UserTrainingPlanRow = InferSelectModel<typeof userTrainingPlans>;
export type UserTrainingPlanInsert = InferInsertModel<typeof userTrainingPlans>;

export type ActivityRow = InferSelectModel<typeof activities>;
export type ActivityInsert = InferInsertModel<typeof activities>;

export type EventRow = InferSelectModel<typeof events>;
export type EventInsert = InferInsertModel<typeof events>;

export type ActivityEffortRow = InferSelectModel<typeof activityEfforts>;
export type ActivityEffortInsert = InferInsertModel<typeof activityEfforts>;

export type IntegrationRow = InferSelectModel<typeof integrations>;
export type IntegrationInsert = InferInsertModel<typeof integrations>;

export type ProfileMetricRow = InferSelectModel<typeof profileMetrics>;
export type ProfileMetricInsert = InferInsertModel<typeof profileMetrics>;

export type ProfileTrainingSettingsRow = InferSelectModel<typeof profileTrainingSettings>;
export type ProfileTrainingSettingsInsert = InferInsertModel<typeof profileTrainingSettings>;

export type ProfileGoalRow = InferSelectModel<typeof profileGoals>;
export type ProfileGoalInsert = InferInsertModel<typeof profileGoals>;

export type OAuthStateRow = InferSelectModel<typeof oauthStates>;
export type OAuthStateInsert = InferInsertModel<typeof oauthStates>;

export type SyncedEventRow = InferSelectModel<typeof syncedEvents>;
export type SyncedEventInsert = InferInsertModel<typeof syncedEvents>;

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
