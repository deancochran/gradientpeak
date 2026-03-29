// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import {
  onboardingRouter,
  profileMetricsRouter,
  profileSettingsRouter,
  profilesRouter,
} from "./account";
import { activitiesRouter, activityEffortsRouter, fitFilesRouter, routesRouter } from "./activity";
import { analyticsRouter, homeRouter, trendsRouter } from "./insights";
import { activityPlansRouter, eventsRouter, goalsRouter, trainingPlansRouter } from "./planning";
import { integrationsRouter, storageRouter } from "./platform";
import {
  coachingRouter,
  feedRouter,
  messagingRouter,
  notificationsRouter,
  socialRouter,
} from "./social/index";

export const appRouter = createTRPCRouter({
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
