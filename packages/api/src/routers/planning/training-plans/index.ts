import { createTRPCRouter } from "../../../trpc";
import { trainingPlansProcedures } from "./base";
import { trainingPlansEffectiveLoadProcedures } from "./effective-load";

export { deriveProfileAwareCreationContext } from "./base";

export const trainingPlansRouter = createTRPCRouter({
  ...trainingPlansProcedures,
  ...trainingPlansEffectiveLoadProcedures,
});
