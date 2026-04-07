import { createTRPCRouter } from "../../../trpc";
import { trainingPlansAnalyticsRouter } from "./analytics";
import { trainingPlansCreationRouter } from "./creation";
import { trainingPlansCrudRouter } from "./crud";

export { trainingPlansAnalyticsRouter } from "./analytics";
export { deriveProfileAwareCreationContext } from "./base";
export { trainingPlansCreationRouter } from "./creation";
export { trainingPlansCrudRouter } from "./crud";

export const trainingPlansRouter = createTRPCRouter({
  ...trainingPlansCreationRouter._def.procedures,
  ...trainingPlansCrudRouter._def.procedures,
  ...trainingPlansAnalyticsRouter._def.procedures,
});
