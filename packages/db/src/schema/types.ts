import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

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

export type ProfileRow = InferSelectModel<typeof profiles>;
export type ProfileInsert = InferInsertModel<typeof profiles>;

export type ActivityRouteRow = InferSelectModel<typeof activityRoutes>;
export type ActivityRouteInsert = InferInsertModel<typeof activityRoutes>;

export type ActivityPlanRow = InferSelectModel<typeof activityPlans>;
export type ActivityPlanInsert = InferInsertModel<typeof activityPlans>;

export type TrainingPlanRow = InferSelectModel<typeof trainingPlans>;
export type TrainingPlanInsert = InferInsertModel<typeof trainingPlans>;

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

export type OAuthStateRow = InferSelectModel<typeof oauthStates>;
export type OAuthStateInsert = InferInsertModel<typeof oauthStates>;

export type SyncedEventRow = InferSelectModel<typeof syncedEvents>;
export type SyncedEventInsert = InferInsertModel<typeof syncedEvents>;

export type LikeRow = InferSelectModel<typeof likes>;
export type LikeInsert = InferInsertModel<typeof likes>;
