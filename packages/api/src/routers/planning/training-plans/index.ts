import { createTRPCRouter } from "../../../trpc";
import { trainingPlansProcedures } from "./base";
import { trainingPlansEffectiveLoadProcedures } from "./effective-load";

export const trainingPlansRouter = createTRPCRouter({
  ...trainingPlansProcedures,
  ...trainingPlansEffectiveLoadProcedures,
});
