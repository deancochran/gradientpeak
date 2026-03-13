// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { activitiesRouter } from "./activities";
import { activityEffortsRouter } from "./activity_efforts";
import { activityPlansRouter } from "./activity_plans";
import { authRouter } from "./auth";
import { coachingRouter } from "./coaching";
import { eventsRouter } from "./events";
import { feedRouter } from "./feed";
import { fitFilesRouter } from "./fit-files";
import { goalsRouter } from "./goals";
import { homeRouter } from "./home";
import { integrationsRouter } from "./integrations";
import { messagingRouter } from "./messaging";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { profileSettingsRouter } from "./profile_settings";
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
  activityEfforts: activityEffortsRouter,
  activityPlans: activityPlansRouter,
  events: eventsRouter,
  goals: goalsRouter,
  fitFiles: fitFilesRouter,
  integrations: integrationsRouter,
  messaging: messagingRouter,
  notifications: notificationsRouter,
  trainingPlans: trainingPlansRouter,
  routes: routesRouter,
  social: socialRouter,
  trends: trendsRouter,
  storage: storageRouter,
  home: homeRouter,
  feed: feedRouter,
  profileSettings: profileSettingsRouter,
});

export type AppRouter = typeof appRouter;
