// packages/api/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import {
  onboardingRouter,
  profileMetricsRouter,
  profileSettingsRouter,
  profilesRouter,
} from "./account";
import {
  activitiesRouter,
  activityEffortsRouter,
  activityFilesRouter,
  routesRouter,
} from "./activity";
import { athleteIntelligenceRouter } from "./athlete-intelligence";
import { groupsRouter } from "./groups";
import { homeRouter, trendsRouter } from "./insights";
import { organizationsRouter } from "./organizations";
import { activityPlansRouter, eventsRouter, goalsRouter, trainingPlansRouter } from "./planning";
import { integrationsRouter, storageRouter } from "./platform";
import { publicShareRouter } from "./public-share";
import { feedRouter, messagingRouter, notificationsRouter, socialRouter } from "./social/index";

export const appRouter = createTRPCRouter({
  profiles: profilesRouter,
  athleteIntelligence: athleteIntelligenceRouter,

  onboarding: onboardingRouter,
  profileMetrics: profileMetricsRouter,
  activities: activitiesRouter,
  activityEfforts: activityEffortsRouter,
  activityPlans: activityPlansRouter,
  events: eventsRouter,
  goals: goalsRouter,
  activityFiles: activityFilesRouter,
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
  groups: groupsRouter,
  publicShare: publicShareRouter,
  organizations: organizationsRouter,
});

export type AppRouter = typeof appRouter;
