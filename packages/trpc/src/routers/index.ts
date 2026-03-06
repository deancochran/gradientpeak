// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { activitiesRouter } from "./activities";
import { activityPlansRouter } from "./activity_plans";
import { authRouter } from "./auth";
import { coachingRouter } from "./coaching";
import { eventsRouter } from "./events";
import { feedRouter } from "./feed";
import { fitFilesRouter } from "./fit-files";
import { homeRouter } from "./home";
import { integrationsRouter } from "./integrations";
import { libraryRouter } from "./library";
import { messagingRouter } from "./messaging";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { profilesRouter } from "./profiles";

import { profileMetricsRouter } from "./profile-metrics";
import { routesRouter } from "./routes";
import { socialRouter } from "./social";
import { storageRouter } from "./storage";
import { trainingPlansRouter } from "./training_plans";
import { trendsRouter } from "./trends";

import { analyticsRouter } from "./analytics";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  coaching: coachingRouter,
  profiles: profilesRouter,
  analytics: analyticsRouter,

  onboarding: onboardingRouter,
  profileMetrics: profileMetricsRouter,
  activities: activitiesRouter,
  activityPlans: activityPlansRouter,
  events: eventsRouter,
  fitFiles: fitFilesRouter,
  integrations: integrationsRouter,
  library: libraryRouter,
  messaging: messagingRouter,
  notifications: notificationsRouter,
  trainingPlans: trainingPlansRouter,
  routes: routesRouter,
  social: socialRouter,
  trends: trendsRouter,
  storage: storageRouter,
  home: homeRouter,
  feed: feedRouter,
});

export type AppRouter = typeof appRouter;
