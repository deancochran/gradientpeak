import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import {
  activities,
  activityEfforts,
  activityPlans,
  activityRoutes,
  integrations,
  profileMetrics,
  profiles,
} from "./tables";

export type ProfileRow = InferSelectModel<typeof profiles>;
export type ProfileInsert = InferInsertModel<typeof profiles>;

export type ActivityRouteRow = InferSelectModel<typeof activityRoutes>;
export type ActivityRouteInsert = InferInsertModel<typeof activityRoutes>;

export type ActivityPlanRow = InferSelectModel<typeof activityPlans>;
export type ActivityPlanInsert = InferInsertModel<typeof activityPlans>;

export type ActivityRow = InferSelectModel<typeof activities>;
export type ActivityInsert = InferInsertModel<typeof activities>;

export type ActivityEffortRow = InferSelectModel<typeof activityEfforts>;
export type ActivityEffortInsert = InferInsertModel<typeof activityEfforts>;

export type IntegrationRow = InferSelectModel<typeof integrations>;
export type IntegrationInsert = InferInsertModel<typeof integrations>;

export type ProfileMetricRow = InferSelectModel<typeof profileMetrics>;
export type ProfileMetricInsert = InferInsertModel<typeof profileMetrics>;
