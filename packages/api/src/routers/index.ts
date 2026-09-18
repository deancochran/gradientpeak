// packages/api/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { onboardingRouter, profileAccessRouter, profilesRouter } from "./account";
import { activitiesRouter, activityFilesRouter, routesRouter } from "./activity";
import { athleteIntelligenceRouter } from "./athlete-intelligence";
import { groupsRouter } from "./groups";
import { homeRouter } from "./insights";
import { organizationsRouter } from "./organizations";
import {
  activityPlansRouter,
  calendarRouter,
  eventsRouter,
  goalsRouter,
  plannedSessionsRouter,
  trainingPlansRouter,
} from "./planning";
import { integrationsRouter, storageRouter } from "./platform";
import { publicShareRouter } from "./public-share";
import { feedRouter, messagingRouter, notificationsRouter, socialRouter } from "./social/index";

export const appRouter = createTRPCRouter({
  profiles: profilesRouter,
  athleteIntelligence: athleteIntelligenceRouter,

  onboarding: onboardingRouter,
  profileAccess: profileAccessRouter,
  activities: activitiesRouter,
  activityPlans: activityPlansRouter,
  calendar: calendarRouter,
  events: eventsRouter,
  goals: goalsRouter,
  activityFiles: activityFilesRouter,
  plannedSessions: plannedSessionsRouter,
  integrations: integrationsRouter,
  messaging: messagingRouter,
  notifications: notificationsRouter,
  trainingPlans: trainingPlansRouter,
  routes: routesRouter,
  social: socialRouter,
  storage: storageRouter,
  home: homeRouter,
  feed: feedRouter,
  groups: groupsRouter,
  publicShare: publicShareRouter,
  organizations: organizationsRouter,
});

export type AppRouter = typeof appRouter;
