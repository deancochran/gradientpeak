import { createTRPCRouter } from "../../../trpc";
import {
  trainingPlansAnalyticsProcedures,
  trainingPlansCreationProcedures,
  trainingPlansCrudProcedures,
} from "./base";
import { trainingPlansEffectiveLoadProcedures } from "./effective-load";

export { trainingPlansAnalyticsRouter } from "./analytics";
export { deriveProfileAwareCreationContext } from "./base";
export { trainingPlansCreationRouter } from "./creation";
export { trainingPlansCrudRouter } from "./crud";
export { trainingPlansEffectiveLoadRouter } from "./effective-load";

export const trainingPlansRouter = createTRPCRouter({
  ...trainingPlansCreationProcedures,
  ...trainingPlansCrudProcedures,
  ...trainingPlansAnalyticsProcedures,
  ...trainingPlansEffectiveLoadProcedures,
});
