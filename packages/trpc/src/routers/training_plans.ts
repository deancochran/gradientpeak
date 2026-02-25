import { createTRPCRouter } from "../trpc";
import { trainingPlansAnalyticsRouter } from "./training-plans.analytics";
import { trainingPlansCreationRouter } from "./training-plans.creation";
import { trainingPlansCrudRouter } from "./training-plans.crud";

export { deriveProfileAwareCreationContext } from "./training-plans.base";

export const trainingPlansRouter = createTRPCRouter({
  ...trainingPlansCreationRouter._def.procedures,
  ...trainingPlansCrudRouter._def.procedures,
  ...trainingPlansAnalyticsRouter._def.procedures,
});
