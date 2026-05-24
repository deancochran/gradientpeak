import { createTRPCRouter } from "../../../trpc";
import {
  trainingPlansAnalyticsProcedures,
  trainingPlansCreationProcedures,
  trainingPlansCrudProcedures,
} from "./base";

export { trainingPlansAnalyticsRouter } from "./analytics";
export { deriveProfileAwareCreationContext } from "./base";
export { trainingPlansCreationRouter } from "./creation";
export { trainingPlansCrudRouter } from "./crud";

export const trainingPlansRouter = createTRPCRouter({
  ...trainingPlansCreationProcedures,
  ...trainingPlansCrudProcedures,
  ...trainingPlansAnalyticsProcedures,
});
