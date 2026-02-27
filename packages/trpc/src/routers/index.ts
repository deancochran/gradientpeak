// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { activitiesRouter } from "./activities";
import { activityPlansRouter } from "./activity_plans";
import { authRouter } from "./auth";
import { eventsRouter } from "./events";
import { fitFilesRouter } from "./fit-files";
import { homeRouter } from "./home";
import { integrationsRouter } from "./integrations";
import { onboardingRouter } from "./onboarding";
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

  onboarding: onboardingRouter,
  profileMetrics: profileMetricsRouter,
  activities: activitiesRouter,
  activityPlans: activityPlansRouter,
  events: eventsRouter,
  fitFiles: fitFilesRouter,
  integrations: integrationsRouter,
  trainingPlans: trainingPlansRouter,
  routes: routesRouter,
  trends: trendsRouter,
  storage: storageRouter,
  home: homeRouter,
});

export type AppRouter = typeof appRouter;
