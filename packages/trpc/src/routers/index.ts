// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { activitiesRouter } from "./activities";
import { authRouter } from "./auth";
import { plannedActivitiesRouter } from "./planned_activities";
import { profilesRouter } from "./profiles";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  profiles: profilesRouter,
  activities: activitiesRouter,
  activityStreams: activityStreamsRouter,
  plannedActivities: plannedActivitiesRouter,
  storage: storageRouter,
  sync: syncRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
