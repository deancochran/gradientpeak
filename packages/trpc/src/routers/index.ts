// packages/trpc/src/routers/index.ts
import { createTRPCRouter } from "../trpc";
import { activitiesRouter } from "./activities";
import { activityPlansRouter } from "./activity_plans";
import { authRouter } from "./auth";
import { integrationsRouter } from "./integrations";
import { plannedActivitiesRouter } from "./planned_activities";
import { profilesRouter } from "./profiles";
import { routesRouter } from "./routes";
import { trainingPlansRouter } from "./training_plans";
import { trendsRouter } from "./trends";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  profiles: profilesRouter,
  activities: activitiesRouter,
  activityPlans: activityPlansRouter,
  plannedActivities: plannedActivitiesRouter,
  integrations: integrationsRouter,
  trainingPlans: trainingPlansRouter,
  routes: routesRouter,
  trends: trendsRouter,
});

export type AppRouter = typeof appRouter;
