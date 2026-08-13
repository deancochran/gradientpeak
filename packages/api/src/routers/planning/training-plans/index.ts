import { createTRPCRouter } from "../../../trpc";
import { trainingPlansProcedures } from "./base";

export const trainingPlansRouter = createTRPCRouter(trainingPlansProcedures);
