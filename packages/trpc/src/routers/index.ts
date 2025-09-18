// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../index";
import { activitiesRouter } from "./activities";
import { activityStreamsRouter } from "./activity_streams";
import { analyticsRouter } from "./analytics";
import { authRouter } from "./auth";
import { plannedActivitiesRouter } from "./planned_activities";
import { profilesRouter } from "./profiles";
import { storageRouter } from "./storage";
import { syncRouter } from "./sync";

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
