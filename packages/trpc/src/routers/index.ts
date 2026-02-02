// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { activitiesRouter } from "./activities";
import { activityPlansRouter } from "./activity_plans";
import { authRouter } from "./auth";
import { fitFilesRouter } from "./fit-files";
import { homeRouter } from "./home";
import { integrationsRouter } from "./integrations";
import { plannedActivitiesRouter } from "./planned_activities";
import { profilesRouter } from "./profiles";

import { profileMetricsRouter } from "./profile-metrics";
import { routesRouter } from "./routes";
import { storageRouter } from "./storage";
import { trainingPlansRouter } from "./training_plans";
import { trendsRouter } from "./trends";

import { analyticsRouter } from "./analytics";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  profiles: profilesRouter,
  analytics: analyticsRouter,

  profileMetrics: profileMetricsRouter,
  activities: activitiesRouter,
  activityPlans: activityPlansRouter,
  plannedActivities: plannedActivitiesRouter,
  fitFiles: fitFilesRouter,
  integrations: integrationsRouter,
  trainingPlans: trainingPlansRouter,
  routes: routesRouter,
  trends: trendsRouter,
  storage: storageRouter,
  home: homeRouter,
});

export type AppRouter = typeof appRouter;
